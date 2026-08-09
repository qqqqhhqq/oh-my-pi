import { isTauri } from "@tauri-apps/api/core";
import { type Dispatch, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopAction } from "../state/desktop-state";
import {
	type DesktopRpcEvent,
	DesktopRpcSession,
	type RpcExtensionUiResponse,
	type RpcInteractiveUiRequest,
	type RpcLaunchConfig,
} from "./rpc-session";
import { type DesktopRuntimeInfo, getDesktopRuntimeInfo, TauriRpcBridge } from "./tauri-rpc-bridge";

const browserRuntimeInfo: DesktopRuntimeInfo = {
	available: false,
	defaultWorkspace: "",
	defaultExecutable: "",
};

function dispatchRpcEvent(dispatch: Dispatch<DesktopAction>, taskId: string, event: DesktopRpcEvent): void {
	switch (event.type) {
		case "connecting":
		case "closed":
			return;
		case "connected":
			dispatch({ type: "rpc.connected", taskId });
			return;
		case "restore_failed":
			dispatch({ type: "rpc.restore_failed", taskId, error: event.message });
			return;
		case "state":
			dispatch({ type: "rpc.state", taskId, state: event.state });
			return;
		case "messages":
			dispatch({ type: "rpc.messages", taskId, messages: event.messages });
			return;
		case "agent_event":
			dispatch({ type: "rpc.agent_event", taskId, event: event.event });
			return;
		case "subagents":
			dispatch({ type: "rpc.subagents", taskId, subagents: event.subagents });
			return;
		case "stderr":
			dispatch({ type: "rpc.stderr", taskId, line: event.line });
			return;
		case "error":
			dispatch({ type: "rpc.failed", taskId, error: event.message });
			return;
		case "exited":
			dispatch({ type: "rpc.exited", taskId, code: event.code });
			return;
		case "ui_effect":
			dispatch({ type: "rpc.ui_effect", taskId, effect: event.effect });
			return;
		case "git_snapshot":
			dispatch({ type: "rpc.git_snapshot", taskId, snapshot: event.snapshot });
			return;
		case "git_error":
			dispatch({ type: "rpc.git_error", taskId, error: event.message });
			return;
		case "ui_request":
		case "ui_cancel":
			return;
	}
}

export function useDesktopRpc(dispatch: Dispatch<DesktopAction>) {
	const bridge = useMemo(() => (isTauri() ? new TauriRpcBridge() : undefined), []);
	const sessions = useRef(new Map<string, DesktopRpcSession>());
	const [runtimeInfo, setRuntimeInfo] = useState<DesktopRuntimeInfo>(browserRuntimeInfo);
	const [uiRequests, setUiRequests] = useState<Record<string, RpcInteractiveUiRequest | undefined>>({});

	useEffect(() => {
		let active = true;
		void getDesktopRuntimeInfo().then(info => {
			if (active) setRuntimeInfo(info);
		});
		return () => {
			active = false;
		};
	}, []);

	async function connect(taskId: string, config: RpcLaunchConfig, sessionPath?: string): Promise<void> {
		if (!bridge) throw new Error("OMP RPC is available only in the Tauri desktop runtime");
		if (sessions.current.has(taskId)) throw new Error("This task already has an RPC session");

		dispatch({ type: "rpc.connecting", taskId, config });
		let session: DesktopRpcSession;
		session = new DesktopRpcSession(taskId, bridge, event => {
			if (event.type === "ui_request") {
				setUiRequests(current => ({ ...current, [taskId]: event.request }));
				return;
			}
			if (event.type === "ui_cancel") {
				setUiRequests(current =>
					current[taskId]?.id === event.targetId ? { ...current, [taskId]: undefined } : current,
				);
				return;
			}
			dispatchRpcEvent(dispatch, taskId, event);
			if (event.type === "connected") {
				dispatch({ type: "rpc.git_loading", taskId });
				void session.refreshGit();
			}
			if (event.type === "agent_event" && event.event.type === "agent_end") void session.refresh();
			if (event.type === "closed" || event.type === "exited") {
				sessions.current.delete(taskId);
				setUiRequests(current => ({ ...current, [taskId]: undefined }));
			}
		});
		sessions.current.set(taskId, session);
		try {
			await session.connect(config, sessionPath);
			await session.awaitReady();
		} catch (error) {
			sessions.current.delete(taskId);
			throw error;
		}
	}

	async function prompt(taskId: string, message: string): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("Connect this task to OMP before sending a prompt");
		const response = await session.prompt(message);
		if (!response.success) throw new Error(response.error);
	}

	async function abort(taskId: string): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) return;
		const response = await session.abort();
		if (!response.success) throw new Error(response.error);
	}

	async function refresh(taskId: string): Promise<void> {
		await sessions.current.get(taskId)?.refresh();
	}

	async function respondToUi(taskId: string, response: RpcExtensionUiResponse): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("The OMP session ended before the request was answered");
		await session.respondToUi(response);
		setUiRequests(current => (current[taskId]?.id === response.id ? { ...current, [taskId]: undefined } : current));
	}

	async function disconnect(taskId: string): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) return;
		sessions.current.delete(taskId);
		try {
			await session.stop();
		} finally {
			dispatch({ type: "rpc.exited", taskId, code: null });
		}
	}

	async function refreshGit(taskId: string): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("Connect this task to OMP before refreshing Git changes");
		dispatch({ type: "rpc.git_loading", taskId });
		await session.refreshGit();
	}

	async function loadGitDiff(taskId: string, path: string): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("Connect this task to OMP before loading a Git diff");
		dispatch({ type: "rpc.git_path_selected", taskId, path });
		try {
			const diff = await session.getGitDiff(path);
			dispatch({ type: "rpc.git_diff", taskId, path, diff });
		} catch (error) {
			dispatch({ type: "rpc.git_error", taskId, error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}

	async function stageGitChanges(taskId: string, paths: string[] = []): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("Connect this task to OMP before staging Git changes");
		try {
			await session.stageGitChanges(paths);
		} catch (error) {
			dispatch({ type: "rpc.git_error", taskId, error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}

	async function discardGitChanges(taskId: string, paths: string[]): Promise<void> {
		const session = sessions.current.get(taskId);
		if (!session) throw new Error("Connect this task to OMP before discarding Git changes");
		try {
			await session.discardGitChanges(paths);
		} catch (error) {
			dispatch({ type: "rpc.git_error", taskId, error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}

	return {
		runtimeInfo,
		uiRequests,
		connect,
		prompt,
		abort,
		refresh,
		respondToUi,
		disconnect,
		refreshGit,
		loadGitDiff,
		stageGitChanges,
		discardGitChanges,
	};
}
