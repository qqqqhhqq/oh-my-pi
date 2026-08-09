import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	RpcBridge,
	RpcBridgeHandlers,
	RpcExitPayload,
	RpcFramePayload,
	RpcLaunchConfig,
	RpcStderrPayload,
} from "./rpc-session";

export interface DesktopRuntimeInfo {
	available: boolean;
	defaultWorkspace: string;
	defaultExecutable: string;
}

export class TauriRpcBridge implements RpcBridge {
	async subscribe(handlers: RpcBridgeHandlers): Promise<() => void> {
		const unlisten = await Promise.all([
			listen<RpcFramePayload>("omp-rpc-frame", event => handlers.frame(event.payload)),
			listen<RpcStderrPayload>("omp-rpc-stderr", event => handlers.stderr(event.payload)),
			listen<RpcExitPayload>("omp-rpc-exit", event => handlers.exit(event.payload)),
		]);

		return () => {
			for (const remove of unlisten) remove();
		};
	}

	async start(taskId: string, config: RpcLaunchConfig): Promise<void> {
		await invoke("start_rpc", { taskId, config });
	}

	async send(taskId: string, frame: string): Promise<void> {
		await invoke("send_rpc", { taskId, frame });
	}

	async stop(taskId: string): Promise<void> {
		await invoke("stop_rpc", { taskId });
	}
}

export async function getDesktopRuntimeInfo(): Promise<DesktopRuntimeInfo> {
	if (!isTauri()) {
		return { available: false, defaultWorkspace: "", defaultExecutable: "" };
	}
	return invoke<DesktopRuntimeInfo>("get_runtime_info");
}
