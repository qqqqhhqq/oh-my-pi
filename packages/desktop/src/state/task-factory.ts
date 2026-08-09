import type { RpcLaunchConfig } from "../rpc/rpc-session";
import type { DesktopTask } from "./desktop-state";
import { workspaceName } from "./project-factory";

export interface DesktopTaskDraft {
	projectId: string;
	title: string;
	cwd: string;
	executable?: string;
	provider?: string;
	model?: string;
}

function launchConfig(draft: DesktopTaskDraft): RpcLaunchConfig {
	return {
		cwd: draft.cwd,
		...(draft.executable ? { executable: draft.executable } : {}),
		...(draft.provider ? { provider: draft.provider } : {}),
		...(draft.model ? { model: draft.model } : {}),
	};
}

export function createDesktopTask(draft: DesktopTaskDraft, id: string, now: number): DesktopTask {
	const workspaceId = workspaceName(draft.cwd);
	return {
		id,
		projectId: draft.projectId,
		workspaceId,
		title: draft.title || `Work in ${workspaceId}`,
		status: "waiting",
		mode: "direct",
		model: draft.model ?? "CLI default",
		thinking: "high",
		cwd: draft.cwd,
		branch: "workspace",
		elapsed: "—",
		contextPercent: 0,
		additions: 0,
		deletions: 0,
		agentCount: 0,
		archived: false,
		lastOpenedAt: now,
		launchConfig: launchConfig(draft),
	};
}
