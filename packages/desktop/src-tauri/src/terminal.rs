use std::{
	collections::HashMap,
	io::{Read, Write},
	path::Path,
	sync::{Arc, Mutex},
};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const TERMINAL_OUTPUT_EVENT: &str = "omp-terminal-output";
const TERMINAL_EXIT_EVENT: &str = "omp-terminal-exit";
const MAX_TERMINAL_DIMENSION: u16 = 500;
const MAX_TERMINAL_WRITE_BYTES: usize = 256 * 1024;

struct ShellSpec {
	program: String,
	args:    Vec<String>,
}

fn shell_spec() -> ShellSpec {
	#[cfg(windows)]
	return ShellSpec { program: "powershell.exe".to_owned(), args: vec!["-NoLogo".to_owned()] };

	#[cfg(not(windows))]
	ShellSpec {
		program: std::env::var("SHELL")
			.ok()
			.filter(|value| !value.trim().is_empty())
			.unwrap_or_else(|| "/bin/sh".to_owned()),
		args:    Vec::new(),
	}
}

fn validated_size(rows: u16, cols: u16) -> Result<PtySize, String> {
	if rows == 0 || cols == 0 || rows > MAX_TERMINAL_DIMENSION || cols > MAX_TERMINAL_DIMENSION {
		return Err(format!(
			"Terminal dimensions must be between 1 and {MAX_TERMINAL_DIMENSION}: {cols}x{rows}"
		));
	}
	Ok(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
	task_id:    String,
	generation: u64,
	data:       Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
	task_id:    String,
	generation: u64,
	code:       Option<u32>,
}

struct TerminalProcess {
	generation: u64,
	stopping:   bool,
	master:     Arc<Mutex<Box<dyn MasterPty + Send>>>,
	writer:     Arc<Mutex<Box<dyn Write + Send>>>,
	killer:     Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
}

#[derive(Default)]
pub struct TerminalProcesses {
	processes: Mutex<HashMap<String, TerminalProcess>>,
}

impl Drop for TerminalProcesses {
	fn drop(&mut self) {
		let Ok(processes) = self.processes.get_mut() else {
			return;
		};
		for process in processes.values() {
			if let Ok(mut killer) = process.killer.lock() {
				let _ = killer.kill();
			}
		}
	}
}

fn lock_error(name: &str) -> String {
	format!("OMP Desktop terminal {name} lock is poisoned")
}

fn generation_is_active(app: &AppHandle, task_id: &str, generation: u64) -> bool {
	app.state::<TerminalProcesses>()
		.processes
		.lock()
		.ok()
		.and_then(|processes| processes.get(task_id).map(|process| process.generation))
		== Some(generation)
}

fn finish_terminal(app: &AppHandle, task_id: &str, generation: u64, code: Option<u32>) {
	let state = app.state::<TerminalProcesses>();
	let removed = {
		let Ok(mut processes) = state.processes.lock() else {
			return;
		};
		if processes.get(task_id).map(|process| process.generation) != Some(generation) {
			return;
		}
		processes.remove(task_id).is_some()
	};
	if removed {
		let _ = app.emit(TERMINAL_EXIT_EVENT, TerminalExitPayload {
			task_id: task_id.to_owned(),
			generation,
			code,
		});
	}
}

#[tauri::command]
pub fn start_terminal(
	app: AppHandle,
	state: State<'_, TerminalProcesses>,
	task_id: String,
	generation: u64,
	cwd: String,
	rows: u16,
	cols: u16,
) -> Result<(), String> {
	if task_id.trim().is_empty() {
		return Err("Terminal task id cannot be empty".to_owned());
	}
	if generation == 0 {
		return Err("Terminal generation must be greater than zero".to_owned());
	}
	if !Path::new(&cwd).is_dir() {
		return Err(format!("Terminal workspace does not exist: {cwd}"));
	}
	let size = validated_size(rows, cols)?;
	let mut processes = state.processes.lock().map_err(|_| lock_error("process"))?;
	if processes.contains_key(&task_id) {
		return Err(format!("Terminal is already running for task: {task_id}"));
	}

	let pair = native_pty_system()
		.openpty(size)
		.map_err(|error| format!("Failed to create terminal: {error}"))?;
	let mut reader = pair
		.master
		.try_clone_reader()
		.map_err(|error| format!("Failed to open terminal output: {error}"))?;
	let writer = pair
		.master
		.take_writer()
		.map_err(|error| format!("Failed to open terminal input: {error}"))?;
	let spec = shell_spec();
	let mut command = CommandBuilder::new(spec.program);
	command.args(spec.args);
	command.cwd(&cwd);
	command.env("TERM", "xterm-256color");
	command.env("COLORTERM", "truecolor");
	let mut child = pair
		.slave
		.spawn_command(command)
		.map_err(|error| format!("Failed to start terminal shell: {error}"))?;
	let killer = child.clone_killer();
	processes.insert(task_id.clone(), TerminalProcess {
		generation,
		stopping: false,
		master: Arc::new(Mutex::new(pair.master)),
		writer: Arc::new(Mutex::new(writer)),
		killer: Arc::new(Mutex::new(killer)),
	});
	drop(processes);
	drop(pair.slave);

	let output_app = app.clone();
	let output_task = task_id.clone();
	let output_thread = std::thread::spawn(move || {
		let mut buffer = [0_u8; 8192];
		loop {
			let count = match reader.read(&mut buffer) {
				Ok(0) | Err(_) => break,
				Ok(count) => count,
			};
			if !generation_is_active(&output_app, &output_task, generation) {
				break;
			}
			let _ = output_app.emit(TERMINAL_OUTPUT_EVENT, TerminalOutputPayload {
				task_id: output_task.clone(),
				generation,
				data: buffer[..count].to_vec(),
			});
		}
	});

	std::thread::spawn(move || {
		let code = child.wait().ok().map(|status| status.exit_code());
		let _ = output_thread.join();
		finish_terminal(&app, &task_id, generation, code);
	});

	Ok(())
}

#[tauri::command]
pub fn write_terminal(
	state: State<'_, TerminalProcesses>,
	task_id: String,
	generation: u64,
	data: Vec<u8>,
) -> Result<(), String> {
	if data.len() > MAX_TERMINAL_WRITE_BYTES {
		return Err(format!("Terminal input exceeds {MAX_TERMINAL_WRITE_BYTES} bytes"));
	}
	let writer = {
		let processes = state.processes.lock().map_err(|_| lock_error("process"))?;
		let process = processes
			.get(&task_id)
			.ok_or_else(|| format!("Terminal is not running for task: {task_id}"))?;
		if process.generation != generation {
			return Err(format!("Terminal generation is stale for task: {task_id}"));
		}
		Arc::clone(&process.writer)
	};
	let mut writer = writer.lock().map_err(|_| lock_error("writer"))?;
	writer
		.write_all(&data)
		.and_then(|_| writer.flush())
		.map_err(|error| format!("Failed to write terminal input: {error}"))
}

#[tauri::command]
pub fn resize_terminal(
	state: State<'_, TerminalProcesses>,
	task_id: String,
	generation: u64,
	rows: u16,
	cols: u16,
) -> Result<(), String> {
	let size = validated_size(rows, cols)?;
	let master = {
		let processes = state.processes.lock().map_err(|_| lock_error("process"))?;
		let process = processes
			.get(&task_id)
			.ok_or_else(|| format!("Terminal is not running for task: {task_id}"))?;
		if process.generation != generation {
			return Err(format!("Terminal generation is stale for task: {task_id}"));
		}
		Arc::clone(&process.master)
	};
	let result = master
		.lock()
		.map_err(|_| lock_error("master"))?
		.resize(size)
		.map_err(|error| format!("Failed to resize terminal: {error}"));
	result
}

#[tauri::command]
pub fn stop_terminal(
	state: State<'_, TerminalProcesses>,
	task_id: String,
	generation: u64,
) -> Result<(), String> {
	let killer = {
		let mut processes = state.processes.lock().map_err(|_| lock_error("process"))?;
		let Some(process) = processes.get_mut(&task_id) else {
			return Ok(());
		};
		if process.generation != generation || process.stopping {
			return Ok(());
		}
		process.stopping = true;
		Arc::clone(&process.killer)
	};
	let result = killer
		.lock()
		.map_err(|_| lock_error("killer"))?
		.kill()
		.map_err(|error| format!("Failed to stop terminal: {error}"));
	if result.is_err() {
		if let Ok(mut processes) = state.processes.lock() {
			if let Some(process) = processes.get_mut(&task_id) {
				if process.generation == generation {
					process.stopping = false;
				}
			}
		}
	}
	result
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn selects_a_native_interactive_shell_without_a_shell_wrapper() {
		let spec = shell_spec();
		#[cfg(windows)]
		{
			assert_eq!(spec.program, "powershell.exe");
			assert_eq!(spec.args, ["-NoLogo"]);
		}
		#[cfg(not(windows))]
		assert!(!spec.program.is_empty());
	}

	#[test]
	fn validates_terminal_dimensions() {
		let size = validated_size(24, 80).expect("ordinary dimensions should be valid");
		assert_eq!(size.rows, 24);
		assert_eq!(size.cols, 80);
		assert!(validated_size(0, 80).is_err());
		assert!(validated_size(24, 501).is_err());
	}

	#[test]
	fn native_pty_runs_shell_and_captures_output() {
		let pair = native_pty_system()
			.openpty(validated_size(24, 80).expect("test terminal size should be valid"))
			.expect("native PTY should open");
		let spec = shell_spec();
		let mut command = CommandBuilder::new(spec.program);
		command.args(spec.args);
		#[cfg(windows)]
		command.args(["-NoProfile", "-NonInteractive", "-Command", "Write-Output OMP_PTY_ROUNDTRIP"]);
		#[cfg(not(windows))]
		command.args(["-c", "printf 'OMP_PTY_ROUNDTRIP\\n'"]);
		let mut child = pair
			.slave
			.spawn_command(command)
			.expect("interactive shell should start");
		let mut killer = child.clone_killer();
		drop(pair.slave);
		let mut reader = pair
			.master
			.try_clone_reader()
			.expect("PTY reader should open");
		let mut writer = pair.master.take_writer().expect("PTY writer should open");
		let (sender, receiver) = std::sync::mpsc::channel();
		std::thread::spawn(move || {
			let mut buffer = [0_u8; 1024];
			loop {
				let count = match reader.read(&mut buffer) {
					Ok(0) | Err(_) => break,
					Ok(count) => count,
				};
				if sender.send(buffer[..count].to_vec()).is_err() {
					break;
				}
			}
		});

		let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
		let mut output = Vec::new();
		let mut answered_cursor_query = false;
		while !output
			.windows(b"OMP_PTY_ROUNDTRIP".len())
			.any(|window| window == b"OMP_PTY_ROUNDTRIP")
		{
			let remaining = deadline.saturating_duration_since(std::time::Instant::now());
			if remaining.is_zero() {
				let _ = killer.kill();
				let _ = child.wait();
				panic!("native PTY shell did not produce output before the deadline");
			}
			let chunk = receiver
				.recv_timeout(remaining)
				.expect("native PTY reader should receive shell output");
			output.extend(chunk);
			if !answered_cursor_query && output.windows(4).any(|window| window == b"\x1b[6n") {
				writer
					.write_all(b"\x1b[1;1R")
					.and_then(|_| writer.flush())
					.expect("terminal emulator response should be writable");
				answered_cursor_query = true;
			}
		}

		let status = loop {
			if let Some(status) = child
				.try_wait()
				.expect("interactive shell status should be readable")
			{
				break status;
			}
			if std::time::Instant::now() >= deadline {
				let _ = killer.kill();
				let status = child.wait().expect("killed shell should exit");
				panic!("native PTY shell did not exit normally: {status:?}");
			}
			std::thread::sleep(std::time::Duration::from_millis(10));
		};
		drop(writer);
		drop(pair.master);
		let output = String::from_utf8_lossy(&output);

		assert!(output.contains("OMP_PTY_ROUNDTRIP"), "unexpected PTY output: {output:?}");
		assert_eq!(status.exit_code(), 0);
	}
}
