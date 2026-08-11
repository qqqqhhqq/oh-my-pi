use std::{
	collections::HashMap,
	io::{BufRead, BufReader, Write},
	path::{Path, PathBuf},
	process::{Child, ChildStdin, Command, Stdio},
	sync::{
		Arc, Mutex,
		atomic::{AtomicU64, Ordering},
	},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const RPC_FRAME_EVENT: &str = "omp-rpc-frame";
const RPC_STDERR_EVENT: &str = "omp-rpc-stderr";
const RPC_EXIT_EVENT: &str = "omp-rpc-exit";
const MAX_RPC_FRAME_BYTES: usize = 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcLaunchConfig {
	cwd:           String,
	provider:      Option<String>,
	model:         Option<String>,
	approval_mode: Option<String>,
	thinking:      Option<String>,
	session_dir:   Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RpcFramePayload {
	task_id: String,
	frame:   String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RpcStderrPayload {
	task_id: String,
	line:    String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RpcExitPayload {
	task_id: String,
	code:    Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeInfo {
	available:         bool,
	default_workspace: String,
}

struct RpcProcess {
	generation: u64,
	child:      Arc<Mutex<Child>>,
	stdin:      Arc<Mutex<ChildStdin>>,
}

#[derive(Default)]
pub struct RpcProcesses {
	processes:       Mutex<HashMap<String, RpcProcess>>,
	next_generation: AtomicU64,
}

impl Drop for RpcProcesses {
	fn drop(&mut self) {
		let Ok(processes) = self.processes.get_mut() else {
			return;
		};
		for process in processes.values() {
			if let Ok(mut child) = process.child.lock() {
				let _ = child.kill();
				let _ = child.wait();
			}
		}
	}
}

struct LaunchSpec {
	program: String,
	args:    Vec<String>,
}

fn bun_executable() -> String {
	if let Ok(executable) = std::env::var("OMP_DESKTOP_BUN") {
		if !executable.trim().is_empty() {
			return executable;
		}
	}

	let binary = if cfg!(windows) { "bun.exe" } else { "bun" };
	let candidates = [
		std::env::var_os("BUN_INSTALL").map(|root| PathBuf::from(root).join("bin").join(binary)),
		std::env::var_os("LOCALAPPDATA").map(|root| {
			PathBuf::from(root)
				.join("Microsoft")
				.join("WinGet")
				.join("Links")
				.join(binary)
		}),
		std::env::var_os("USERPROFILE")
			.map(|root| PathBuf::from(root).join(".bun").join("bin").join(binary)),
		std::env::var_os("HOME")
			.map(|root| PathBuf::from(root).join(".bun").join("bin").join(binary)),
	];
	candidates
		.into_iter()
		.flatten()
		.find(|path| path.is_file())
		.map(|path| path.to_string_lossy().into_owned())
		.unwrap_or_else(|| "bun".to_owned())
}

fn first_existing_file(candidates: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
	candidates.into_iter().find(|path| path.is_file())
}

fn installed_omp_executable() -> Option<PathBuf> {
	let binary = if cfg!(windows) { "omp.exe" } else { "omp" };
	if let Some(path_value) = std::env::var_os("PATH") {
		if let Some(path) =
			first_existing_file(std::env::split_paths(&path_value).map(|root| root.join(binary)))
		{
			return Some(path);
		}
	}

	let candidates = if cfg!(windows) {
		vec![
			std::env::var_os("LOCALAPPDATA").map(|root| PathBuf::from(root).join("omp").join(binary)),
			std::env::var_os("USERPROFILE")
				.map(|root| PathBuf::from(root).join(".bun").join("bin").join(binary)),
		]
	} else {
		vec![
			std::env::var_os("HOME")
				.map(|root| PathBuf::from(&root).join(".local").join("bin").join(binary)),
			std::env::var_os("HOME")
				.map(|root| PathBuf::from(root).join(".bun").join("bin").join(binary)),
		]
	};
	first_existing_file(candidates.into_iter().flatten())
}

fn default_executable() -> String {
	if let Ok(executable) = std::env::var("OMP_DESKTOP_CLI") {
		if !executable.trim().is_empty() {
			return executable;
		}
	}

	if cfg!(debug_assertions) {
		let source_cli = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../coding-agent/src/cli.ts");
		if let Ok(path) = source_cli.canonicalize() {
			return path.to_string_lossy().into_owned();
		}
	}
	if let Some(path) = installed_omp_executable() {
		return path.to_string_lossy().into_owned();
	}

	"omp".to_owned()
}

fn command_spec(executable: &str, config: &RpcLaunchConfig) -> LaunchSpec {
	let extension = Path::new(executable)
		.extension()
		.and_then(|value| value.to_str())
		.map(str::to_ascii_lowercase);
	let is_script = matches!(extension.as_deref(), Some("js" | "mjs" | "cjs" | "ts"));

	let (program, mut args) = if is_script {
		(bun_executable(), vec![executable.to_owned()])
	} else {
		(executable.to_owned(), Vec::new())
	};

	args.extend(["--mode".to_owned(), "rpc-ui".to_owned()]);
	if let Some(provider) = &config.provider {
		args.extend(["--provider".to_owned(), provider.clone()]);
	}
	if let Some(model) = &config.model {
		args.extend(["--model".to_owned(), model.clone()]);
	}
	if let Some(approval_mode) = &config.approval_mode {
		args.extend(["--approval-mode".to_owned(), approval_mode.clone()]);
	}
	if let Some(thinking) = &config.thinking {
		args.extend(["--thinking".to_owned(), thinking.clone()]);
	}
	if let Some(session_dir) = &config.session_dir {
		args.extend(["--session-dir".to_owned(), session_dir.clone()]);
	}

	LaunchSpec { program, args }
}

fn launch_spec(config: &RpcLaunchConfig) -> LaunchSpec {
	command_spec(&default_executable(), config)
}

fn discover_workspace() -> PathBuf {
	let current = std::env::current_dir().unwrap_or_default();
	current
		.ancestors()
		.find(|candidate| candidate.join(".git").exists())
		.map(Path::to_path_buf)
		.unwrap_or(current)
}

fn lock_error(name: &str) -> String {
	format!("OMP Desktop {name} lock is poisoned")
}

fn terminate_child(child: &mut Child) -> Result<Option<i32>, String> {
	if let Some(status) = child
		.try_wait()
		.map_err(|error| format!("Failed to inspect RPC task: {error}"))?
	{
		return Ok(status.code());
	}

	child
		.kill()
		.map_err(|error| format!("Failed to stop RPC task: {error}"))?;
	child
		.wait()
		.map(|status| status.code())
		.map_err(|error| format!("Failed to collect RPC task: {error}"))
}

#[cfg(windows)]
fn configure_rpc_command(command: &mut Command) {
	use std::os::windows::process::CommandExt;

	const CREATE_NO_WINDOW: u32 = 0x08000000;
	command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn configure_rpc_command(_command: &mut Command) {}

fn read_bounded_rpc_line(reader: &mut impl BufRead) -> Result<Option<String>, String> {
	let mut bytes = Vec::new();
	loop {
		let available = reader
			.fill_buf()
			.map_err(|error| format!("Failed to read RPC output: {error}"))?;
		if available.is_empty() {
			if bytes.is_empty() {
				return Ok(None);
			}
			break;
		}
		if let Some(newline_index) = available.iter().position(|byte| *byte == b'\n') {
			if bytes.len() + newline_index + 1 > MAX_RPC_FRAME_BYTES {
				return Err(format!("RPC output frame exceeds {MAX_RPC_FRAME_BYTES} bytes"));
			}
			bytes.extend_from_slice(&available[..newline_index]);
			reader.consume(newline_index + 1);
			break;
		}
		if bytes.len() + available.len() + 1 > MAX_RPC_FRAME_BYTES {
			return Err(format!("RPC output frame exceeds {MAX_RPC_FRAME_BYTES} bytes"));
		}
		let consumed = available.len();
		bytes.extend_from_slice(available);
		reader.consume(consumed);
	}
	if bytes.last() == Some(&b'\r') {
		bytes.pop();
	}
	String::from_utf8(bytes)
		.map(Some)
		.map_err(|error| format!("RPC output is not valid UTF-8: {error}"))
}

fn validate_outgoing_rpc_frame(frame: &str) -> Result<(), String> {
	if frame.len() + 1 > MAX_RPC_FRAME_BYTES {
		return Err(format!("RPC frame exceeds {MAX_RPC_FRAME_BYTES} bytes"));
	}
	if frame.contains(['\n', '\r']) {
		return Err("RPC frame must contain exactly one JSON object".to_owned());
	}
	serde_json::from_str::<serde_json::Value>(frame)
		.map_err(|error| format!("Invalid RPC JSON: {error}"))?;
	Ok(())
}

#[tauri::command]
pub fn get_runtime_info() -> DesktopRuntimeInfo {
	DesktopRuntimeInfo {
		available:         true,
		default_workspace: discover_workspace().to_string_lossy().into_owned(),
	}
}

#[tauri::command]
pub fn start_rpc(
	app: AppHandle,
	state: State<'_, RpcProcesses>,
	task_id: String,
	config: RpcLaunchConfig,
) -> Result<(), String> {
	if task_id.trim().is_empty() {
		return Err("RPC task id cannot be empty".to_owned());
	}
	let cwd = Path::new(&config.cwd);
	if !cwd.is_dir() {
		return Err(format!("Workspace does not exist: {}", config.cwd));
	}

	let mut processes = state.processes.lock().map_err(|_| lock_error("process"))?;
	if processes.contains_key(&task_id) {
		return Err(format!("RPC task is already running: {task_id}"));
	}

	let spec = launch_spec(&config);
	let mut command = Command::new(&spec.program);
	command
		.args(&spec.args)
		.current_dir(cwd)
		.env("NO_COLOR", "1")
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped());
	configure_rpc_command(&mut command);

	let mut child = command
		.spawn()
		.map_err(|error| format!("Failed to start {}: {error}", spec.program))?;
	let stdin = child
		.stdin
		.take()
		.ok_or_else(|| "OMP RPC stdin is unavailable".to_owned())?;
	let stdout = child
		.stdout
		.take()
		.ok_or_else(|| "OMP RPC stdout is unavailable".to_owned())?;
	let stderr = child
		.stderr
		.take()
		.ok_or_else(|| "OMP RPC stderr is unavailable".to_owned())?;

	let generation = state.next_generation.fetch_add(1, Ordering::Relaxed) + 1;
	let process = RpcProcess {
		generation,
		child: Arc::new(Mutex::new(child)),
		stdin: Arc::new(Mutex::new(stdin)),
	};
	processes.insert(task_id.clone(), process);
	drop(processes);

	let stdout_app = app.clone();
	let stdout_task = task_id.clone();
	std::thread::spawn(move || {
		let mut reader = BufReader::new(stdout);
		let mut terminate = false;
		loop {
			match read_bounded_rpc_line(&mut reader) {
				Ok(Some(frame)) => {
					let _ = stdout_app
						.emit(RPC_FRAME_EVENT, RpcFramePayload { task_id: stdout_task.clone(), frame });
				},
				Ok(None) => break,
				Err(error) => {
					terminate = true;
					let _ = stdout_app.emit(RPC_STDERR_EVENT, RpcStderrPayload {
						task_id: stdout_task.clone(),
						line:    error,
					});
					break;
				},
			}
		}
		finish_process(&stdout_app, &stdout_task, generation, terminate);
	});

	std::thread::spawn(move || {
		for line in BufReader::new(stderr).lines() {
			let Ok(line) = line else {
				break;
			};
			let _ = app.emit(RPC_STDERR_EVENT, RpcStderrPayload { task_id: task_id.clone(), line });
		}
	});

	Ok(())
}

#[tauri::command]
pub fn send_rpc(
	state: State<'_, RpcProcesses>,
	task_id: String,
	frame: String,
) -> Result<(), String> {
	validate_outgoing_rpc_frame(&frame)?;

	let stdin = {
		let processes = state.processes.lock().map_err(|_| lock_error("process"))?;
		processes
			.get(&task_id)
			.map(|process| Arc::clone(&process.stdin))
			.ok_or_else(|| format!("RPC task is not running: {task_id}"))?
	};
	let mut stdin = stdin.lock().map_err(|_| lock_error("stdin"))?;
	writeln!(stdin, "{frame}").map_err(|error| format!("Failed to write RPC frame: {error}"))?;
	stdin
		.flush()
		.map_err(|error| format!("Failed to flush RPC frame: {error}"))
}

#[tauri::command]
pub fn stop_rpc(
	app: AppHandle,
	state: State<'_, RpcProcesses>,
	task_id: String,
) -> Result<(), String> {
	let Some(process) = state
		.processes
		.lock()
		.map_err(|_| lock_error("process"))?
		.remove(&task_id)
	else {
		return Ok(());
	};

	drop(process.stdin);
	let code = {
		let mut child = process.child.lock().map_err(|_| lock_error("child"))?;
		terminate_child(&mut child)?
	};
	let _ = app.emit(RPC_EXIT_EVENT, RpcExitPayload { task_id, code });
	Ok(())
}

fn finish_process(app: &AppHandle, task_id: &str, generation: u64, terminate: bool) {
	let state = app.state::<RpcProcesses>();
	let process = {
		let Ok(mut processes) = state.processes.lock() else {
			return;
		};
		if processes.get(task_id).map(|process| process.generation) != Some(generation) {
			return;
		}
		processes.remove(task_id)
	};

	let Some(process) = process else {
		return;
	};
	drop(process.stdin);
	let code = process.child.lock().ok().and_then(|mut child| {
		if terminate {
			terminate_child(&mut child).ok().flatten()
		} else {
			child.wait().ok().and_then(|status| status.code())
		}
	});
	let _ = app.emit(RPC_EXIT_EVENT, RpcExitPayload { task_id: task_id.to_owned(), code });
}

#[cfg(test)]
mod tests {
	use std::{fs, io::Cursor, process::Command};

	use super::{
		MAX_RPC_FRAME_BYTES, RpcLaunchConfig, command_spec, first_existing_file,
		read_bounded_rpc_line, terminate_child, validate_outgoing_rpc_frame,
	};

	fn config() -> RpcLaunchConfig {
		RpcLaunchConfig {
			cwd:           ".".to_owned(),
			provider:      None,
			model:         None,
			approval_mode: None,
			thinking:      None,
			session_dir:   None,
		}
	}

	#[test]
	fn compiled_cli_is_launched_directly() {
		let spec = command_spec("omp", &config());

		assert_eq!(spec.program, "omp");
		assert_eq!(spec.args, ["--mode", "rpc-ui"]);
	}

	#[test]
	fn source_cli_is_launched_through_bun() {
		let spec = command_spec("C:/workspace/packages/coding-agent/src/cli.ts", &config());

		assert!(spec.program.ends_with("bun") || spec.program.ends_with("bun.exe"));
		assert_eq!(spec.args, ["C:/workspace/packages/coding-agent/src/cli.ts", "--mode", "rpc-ui"]);
	}

	#[test]
	fn executable_discovery_selects_the_first_existing_file() {
		let directory =
			std::env::temp_dir().join(format!("omp-desktop-discovery-{}", std::process::id()));
		let missing = directory.join("missing-omp");
		let existing = directory.join("omp");
		fs::create_dir_all(&directory).expect("temporary discovery directory should be created");
		fs::write(&existing, b"test").expect("temporary executable candidate should be written");

		let selected = first_existing_file([missing, existing.clone()]);

		assert_eq!(selected, Some(existing));
		fs::remove_dir_all(directory).expect("temporary discovery directory should be removed");
	}

	#[test]
	fn model_options_are_forwarded_without_a_shell() {
		let mut config = config();
		config.provider = Some("openai".to_owned());
		config.model = Some("gpt-5".to_owned());
		let spec = command_spec("omp", &config);

		assert_eq!(spec.args, ["--mode", "rpc-ui", "--provider", "openai", "--model", "gpt-5"]);
	}

	#[test]
	fn approval_mode_and_thinking_are_forwarded() {
		let mut config = config();
		config.approval_mode = Some("write".to_owned());
		config.thinking = Some("high".to_owned());
		let spec = command_spec("omp", &config);

		assert_eq!(spec.args, ["--mode", "rpc-ui", "--approval-mode", "write", "--thinking", "high"]);
	}

	#[test]
	fn terminating_an_already_exited_process_returns_its_status() {
		#[cfg(windows)]
		let mut child = Command::new("cmd")
			.args(["/C", "exit", "7"])
			.spawn()
			.expect("test process should start");
		#[cfg(not(windows))]
		let mut child = Command::new("sh")
			.args(["-c", "exit 7"])
			.spawn()
			.expect("test process should start");

		let status = child.wait().expect("test process should exit");
		assert_eq!(status.code(), Some(7));
		assert_eq!(terminate_child(&mut child).expect("termination should be idempotent"), Some(7));
	}

	#[test]
	fn bounded_rpc_reader_accepts_crlf_without_exposing_the_delimiter() {
		let mut input = Cursor::new(b"{\"type\":\"ready\"}\r\n".to_vec());

		assert_eq!(
			read_bounded_rpc_line(&mut input).expect("ordinary RPC frame should be readable"),
			Some("{\"type\":\"ready\"}".to_owned()),
		);
		assert_eq!(read_bounded_rpc_line(&mut input).expect("EOF should be readable"), None);
	}

	#[test]
	fn bounded_rpc_reader_rejects_a_physical_line_before_unbounded_allocation() {
		let mut bytes = vec![b'x'; MAX_RPC_FRAME_BYTES];
		bytes.push(b'\n');
		let mut input = Cursor::new(bytes);

		let error =
			read_bounded_rpc_line(&mut input).expect_err("oversized RPC line should be rejected");
		assert!(error.contains("exceeds"), "unexpected error: {error}");
	}

	#[test]
	fn outgoing_rpc_frame_limit_counts_utf8_bytes_and_the_newline() {
		let oversized = format!("\"{}\"", "界".repeat(MAX_RPC_FRAME_BYTES / 3));

		let error = validate_outgoing_rpc_frame(&oversized)
			.expect_err("outgoing RPC frame larger than the physical limit should be rejected");
		assert!(error.contains("exceeds"), "unexpected error: {error}");
	}
}
