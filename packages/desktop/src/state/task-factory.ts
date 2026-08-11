import type { RpcLaunchConfig } from "../rpc/rpc-session";
import type { DesktopTask } from "./desktop-state";
import { workspaceName } from "./project-factory";

export interface DesktopTaskDraft {
	projectId: string;
	title?: string;
	cwd: string;
	provider?: string;
	model?: string;
	approvalMode?: "always-ask" | "write" | "yolo";
	thinking?: DesktopTask["thinking"];
}

function launchConfig(draft: DesktopTaskDraft): RpcLaunchConfig {
	return {
		cwd: draft.cwd,
		...(draft.provider ? { provider: draft.provider } : {}),
		...(draft.model ? { model: draft.model } : {}),
		...(draft.approvalMode ? { approvalMode: draft.approvalMode } : {}),
		...(draft.thinking ? { thinking: draft.thinking } : {}),
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
		approvalMode: draft.approvalMode,
		thinking: draft.thinking ?? "high",
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
