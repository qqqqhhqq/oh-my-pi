mod editor;
mod rpc;
mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_dialog::init())
		.manage(rpc::RpcProcesses::default())
		.manage(terminal::TerminalProcesses::default())
		.invoke_handler(tauri::generate_handler![
			editor::open_in_editor,
			rpc::get_runtime_info,
			rpc::start_rpc,
			rpc::send_rpc,
			rpc::stop_rpc,
			terminal::start_terminal,
			terminal::write_terminal,
			terminal::resize_terminal,
			terminal::stop_terminal
		])
		.run(tauri::generate_context!())
		.expect("failed to run OMP Desktop");
}
