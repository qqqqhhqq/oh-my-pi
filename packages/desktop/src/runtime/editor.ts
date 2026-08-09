import { invoke, isTauri } from "@tauri-apps/api/core";

export async function openWorkspaceInEditor(path: string): Promise<void> {
	if (!isTauri()) throw new Error("Opening an editor is available only in the desktop runtime");
	await invoke("open_in_editor", { path });
}
