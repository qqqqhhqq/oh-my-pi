#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::{
	path::PathBuf,
	process::{Command, Stdio},
};

#[derive(Debug, PartialEq)]
struct EditorCandidate {
	program: &'static str,
}

fn editor_candidates() -> Vec<EditorCandidate> {
	let mut candidates =
		vec![EditorCandidate { program: "code" }, EditorCandidate { program: "codium" }];
	#[cfg(target_os = "windows")]
	candidates.push(EditorCandidate { program: "explorer.exe" });
	#[cfg(target_os = "macos")]
	candidates.push(EditorCandidate { program: "open" });
	#[cfg(all(unix, not(target_os = "macos")))]
	candidates.push(EditorCandidate { program: "xdg-open" });
	candidates
}

#[tauri::command]
pub fn open_in_editor(path: String) -> Result<(), String> {
	let workspace = PathBuf::from(&path);
	if !workspace.is_dir() {
		return Err(format!("Workspace directory does not exist: {path}"));
	}

	let mut last_error = None;
	for candidate in editor_candidates() {
		let mut command = Command::new(candidate.program);
		command
			.arg(&workspace)
			.stdin(Stdio::null())
			.stdout(Stdio::null())
			.stderr(Stdio::null());
		#[cfg(target_os = "windows")]
		command.creation_flags(0x08000000);
		match command.spawn() {
			Ok(_) => return Ok(()),
			Err(error) => last_error = Some(error),
		}
	}

	Err(format!(
		"Could not open workspace in an editor or file manager: {}",
		last_error.map_or_else(|| "no launcher is available".to_string(), |error| error.to_string())
	))
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn prefers_code_editors_before_the_platform_fallback() {
		let candidates = editor_candidates();
		assert_eq!(candidates.first().map(|candidate| candidate.program), Some("code"));
		assert_eq!(candidates.get(1).map(|candidate| candidate.program), Some("codium"));
		#[cfg(target_os = "windows")]
		assert_eq!(candidates.last().map(|candidate| candidate.program), Some("explorer.exe"));
		#[cfg(target_os = "macos")]
		assert_eq!(candidates.last().map(|candidate| candidate.program), Some("open"));
		#[cfg(all(unix, not(target_os = "macos")))]
		assert_eq!(candidates.last().map(|candidate| candidate.program), Some("xdg-open"));
	}
}
