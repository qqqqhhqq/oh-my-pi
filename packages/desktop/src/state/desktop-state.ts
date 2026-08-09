import { projectAgentEvent, projectMessages } from "../rpc/rpc-projection";
import type { RpcGitSnapshot, RpcLaunchConfig, RpcUiEffect } from "../rpc/rpc-session";
import { appendTerminalOutput } from "../terminal/terminal-output";
import { workspaceName } from "./project-factory";
import type { PersistedDesktopTask } from "./task-catalog";

export type WorkbenchTab = "changes" | "terminal" | "agents";

export type TaskStatus = "running" | "waiting" | "review" | "completed" | "failed";

export interface DesktopTask {
	id: string;
	projectId: string;
	workspaceId: string;
	title: string;
	status: TaskStatus;
	mode: "worktree" | "direct";
	model: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	cwd: string;
	branch: string;
	elapsed: string;
	contextPercent: number;
	additions: number;
	deletions: number;
	agentCount: number;
	archived: boolean;
	lastOpenedAt: number;
	launchConfig: RpcLaunchConfig;
	sessionPath?: string;
}

export interface ConversationEntry {
	id: string;
	kind: "user" | "assistant" | "tool" | "notice" | "turn";
	title?: string;
	body: string;
	meta?: string;
	status?: "running" | "complete" | "waiting" | "failed";
	turnId?: string;
}

export type RpcConnectionStatus = "preview" | "disconnected" | "connecting" | "connected" | "error";

export interface DesktopTaskRuntime {
	status: RpcConnectionStatus;
	error?: string;
	restoreFailed?: boolean;
	sessionId?: string;
	stderr: string[];
}

export interface DesktopAgent {
	id: string;
	label: string;
	description?: string;
	status: string;
}

export interface DesktopGitRuntime {
	status: "idle" | "loading" | "ready" | "error";
	snapshot?: RpcGitSnapshot;
	selectedPath?: string;
	diff?: string;
	diffLoading?: boolean;
	error?: string;
}

export interface DesktopTerminalRuntime {
	status: "offline" | "starting" | "running" | "stopping" | "exited" | "error";
	output: string;
	outputOffset: number;
	generation?: number;
	exitCode?: number | null;
	error?: string;
}

export interface RpcStateProjection {
	model?: { id: string };
	thinkingLevel?: string;
	isStreaming: boolean;
	sessionId: string;
	sessionFile?: string;
	contextUsage?: { percent: number };
}

export interface DesktopState {
	selectedTaskId: string;
	activeWorkbenchTab: WorkbenchTab;
	tasks: DesktopTask[];
	conversations: Record<string, ConversationEntry[]>;
	runtimes: Record<string, DesktopTaskRuntime>;
	agents: Record<string, DesktopAgent[]>;
	git: Record<string, DesktopGitRuntime>;
	terminals: Record<string, DesktopTerminalRuntime>;
	composerDrafts: Record<string, string>;
}

export type DesktopAction =
	| { type: "task.selected"; taskId: string; openedAt?: number }
	| { type: "task.created"; task: DesktopTask }
	| { type: "task.renamed"; taskId: string; title: string }
	| { type: "task.reconfigured"; taskId: string; projectId: string; title: string; config: RpcLaunchConfig }
	| { type: "task.archived"; taskId: string; archived: boolean }
	| { type: "task.deleted"; taskId: string }
	| { type: "task.session_file_changed"; taskId: string; sessionPath?: string }
	| { type: "workbench.selected"; tab: WorkbenchTab }
	| { type: "composer.changed"; taskId: string; value: string }
	| { type: "rpc.connecting"; taskId: string; config: RpcLaunchConfig }
	| { type: "rpc.connected"; taskId: string }
	| { type: "rpc.restore_failed"; taskId: string; error: string }
	| { type: "rpc.failed"; taskId: string; error: string }
	| { type: "rpc.exited"; taskId: string; code: number | null }
	| { type: "rpc.stderr"; taskId: string; line: string }
	| { type: "rpc.state"; taskId: string; state: RpcStateProjection }
	| { type: "rpc.messages"; taskId: string; messages: readonly unknown[] }
	| { type: "rpc.agent_event"; taskId: string; event: unknown }
	| { type: "rpc.subagents"; taskId: string; subagents: readonly unknown[] }
	| { type: "rpc.git_loading"; taskId: string }
	| { type: "rpc.git_snapshot"; taskId: string; snapshot: RpcGitSnapshot }
	| { type: "rpc.git_error"; taskId: string; error: string }
	| { type: "rpc.git_path_selected"; taskId: string; path: string }
	| { type: "rpc.git_diff"; taskId: string; path: string; diff: string }
	| { type: "terminal.starting"; taskId: string; generation: number }
	| { type: "terminal.started"; taskId: string; generation: number }
	| { type: "terminal.stopping"; taskId: string; generation: number }
	| { type: "terminal.output"; taskId: string; generation: number; chunk: string }
	| { type: "terminal.exited"; taskId: string; generation: number; code: number | null }
	| { type: "terminal.stop_failed"; taskId: string; generation: number; error: string }
	| { type: "terminal.failed"; taskId: string; generation: number; error: string }
	| { type: "rpc.ui_effect"; taskId: string; effect: RpcUiEffect };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function updateTask(state: DesktopState, taskId: string, update: (task: DesktopTask) => DesktopTask): DesktopTask[] {
	return state.tasks.map(task => (task.id === taskId ? update(task) : task));
}

function updateRuntime(
	state: DesktopState,
	taskId: string,
	update: (runtime: DesktopTaskRuntime) => DesktopTaskRuntime,
): Record<string, DesktopTaskRuntime> {
	const runtime = state.runtimes[taskId] ?? { status: "disconnected", stderr: [] };
	return { ...state.runtimes, [taskId]: update(runtime) };
}

function updateTerminal(
	state: DesktopState,
	taskId: string,
	update: (terminal: DesktopTerminalRuntime) => DesktopTerminalRuntime,
): Record<string, DesktopTerminalRuntime> {
	const terminal = state.terminals[taskId] ?? { status: "offline", output: "", outputOffset: 0 };
	return { ...state.terminals, [taskId]: update(terminal) };
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key));
}

function fallbackTaskId(tasks: readonly DesktopTask[]): string {
	return (
		[...tasks].filter(task => !task.archived).sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)[0]?.id ??
		""
	);
}

export function createDesktopStateFromCatalog(tasks: readonly PersistedDesktopTask[]): DesktopState {
	const hydratedTasks: DesktopTask[] = tasks.map(task => ({
		...task,
		status: "waiting",
		elapsed: "—",
		contextPercent: 0,
		additions: 0,
		deletions: 0,
		agentCount: 0,
	}));
	const emptyCollections = Object.fromEntries(hydratedTasks.map(task => [task.id, []]));

	return {
		selectedTaskId: fallbackTaskId(hydratedTasks),
		activeWorkbenchTab: "changes",
		tasks: hydratedTasks,
		conversations: emptyCollections,
		runtimes: Object.fromEntries(
			hydratedTasks.map(task => [task.id, { status: "disconnected" as const, stderr: [] }]),
		),
		agents: emptyCollections,
		git: Object.fromEntries(hydratedTasks.map(task => [task.id, { status: "idle" as const }])),
		terminals: Object.fromEntries(
			hydratedTasks.map(task => [task.id, { status: "offline" as const, output: "", outputOffset: 0 }]),
		),
		composerDrafts: Object.fromEntries(hydratedTasks.map(task => [task.id, ""])),
	};
}

function normalizeThinking(value: string | undefined, fallback: DesktopTask["thinking"]): DesktopTask["thinking"] {
	if (
		value === "off" ||
		value === "minimal" ||
		value === "low" ||
		value === "medium" ||
		value === "high" ||
		value === "xhigh" ||
		value === "max"
	) {
		return value;
	}
	return fallback;
}

function projectSubagents(subagents: readonly unknown[]): DesktopAgent[] {
	return subagents.flatMap(value => {
		if (!isRecord(value) || typeof value.id !== "string") return [];
		return [
			{
				id: value.id,
				label:
					typeof value.description === "string"
						? value.description
						: typeof value.agent === "string"
							? value.agent
							: "Subagent",
				description: typeof value.task === "string" ? value.task : undefined,
				status: typeof value.status === "string" ? value.status : "running",
			},
		];
	});
}

export function desktopReducer(state: DesktopState, action: DesktopAction): DesktopState {
	switch (action.type) {
		case "task.selected":
			return state.tasks.some(task => task.id === action.taskId)
				? {
						...state,
						selectedTaskId: action.taskId,
						tasks: action.openedAt
							? updateTask(state, action.taskId, task => ({ ...task, lastOpenedAt: action.openedAt! }))
							: state.tasks,
					}
				: state;
		case "task.created":
			if (state.tasks.some(task => task.id === action.task.id)) return state;
			return {
				...state,
				selectedTaskId: action.task.id,
				tasks: [...state.tasks, action.task],
				conversations: { ...state.conversations, [action.task.id]: [] },
				runtimes: { ...state.runtimes, [action.task.id]: { status: "disconnected", stderr: [] } },
				agents: { ...state.agents, [action.task.id]: [] },
				git: { ...state.git, [action.task.id]: { status: "idle" } },
				terminals: {
					...state.terminals,
					[action.task.id]: { status: "offline", output: "", outputOffset: 0 },
				},
				composerDrafts: { ...state.composerDrafts, [action.task.id]: "" },
			};
		case "task.renamed": {
			const title = action.title.trim();
			return title ? { ...state, tasks: updateTask(state, action.taskId, task => ({ ...task, title })) } : state;
		}
		case "task.reconfigured": {
			const title = action.title.trim();
			const workspaceId = workspaceName(action.config.cwd);
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({
					...task,
					projectId: action.projectId,
					workspaceId,
					title: title || `Work in ${workspaceId}`,
					cwd: action.config.cwd,
					model: action.config.model ?? "CLI default",
					launchConfig: action.config,
					sessionPath: undefined,
				})),
				git: { ...state.git, [action.taskId]: { status: "idle" } },
			};
		}
		case "task.archived": {
			const tasks = updateTask(state, action.taskId, task => ({ ...task, archived: action.archived }));
			return {
				...state,
				tasks,
				selectedTaskId:
					state.selectedTaskId === action.taskId && action.archived ? fallbackTaskId(tasks) : state.selectedTaskId,
			};
		}
		case "task.deleted": {
			if (!state.tasks.some(task => task.id === action.taskId)) return state;
			const tasks = state.tasks.filter(task => task.id !== action.taskId);
			return {
				...state,
				tasks,
				selectedTaskId: state.selectedTaskId === action.taskId ? fallbackTaskId(tasks) : state.selectedTaskId,
				conversations: withoutKey(state.conversations, action.taskId),
				runtimes: withoutKey(state.runtimes, action.taskId),
				agents: withoutKey(state.agents, action.taskId),
				git: withoutKey(state.git, action.taskId),
				terminals: withoutKey(state.terminals, action.taskId),
				composerDrafts: withoutKey(state.composerDrafts, action.taskId),
			};
		}
		case "task.session_file_changed":
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({ ...task, sessionPath: action.sessionPath })),
			};
		case "workbench.selected":
			return { ...state, activeWorkbenchTab: action.tab };
		case "composer.changed":
			return { ...state, composerDrafts: { ...state.composerDrafts, [action.taskId]: action.value } };
		case "rpc.connecting":
			if (!state.tasks.some(task => task.id === action.taskId)) return state;
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({
					...task,
					cwd: action.config.cwd,
					launchConfig: action.config,
					model: action.config.model ?? task.model,
					mode: "direct",
					status: "waiting",
				})),
				conversations: { ...state.conversations, [action.taskId]: [] },
				composerDrafts: { ...state.composerDrafts, [action.taskId]: "" },
				git: { ...state.git, [action.taskId]: { status: "idle" } },
				runtimes: updateRuntime(state, action.taskId, () => ({
					status: "connecting",
					stderr: [],
					restoreFailed: false,
				})),
				agents: { ...state.agents, [action.taskId]: [] },
			};
		case "rpc.connected":
			return {
				...state,
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					status: "connected",
					error: undefined,
				})),
			};
		case "rpc.restore_failed":
			return {
				...state,
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					status: "error",
					error: action.error,
					restoreFailed: true,
				})),
			};
		case "rpc.failed":
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({ ...task, status: "failed" })),
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					status: "error",
					error: action.error,
				})),
			};
		case "rpc.exited":
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({
					...task,
					status: action.code === 0 || action.code === null ? "completed" : "failed",
				})),
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					status: "disconnected",
					error: action.code && action.code !== 0 ? `OMP exited with code ${action.code}` : undefined,
				})),
			};
		case "rpc.stderr":
			return {
				...state,
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					stderr: [...runtime.stderr, action.line].slice(-100),
				})),
			};
		case "rpc.state":
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({
					...task,
					model: action.state.model?.id ?? task.model,
					thinking: normalizeThinking(action.state.thinkingLevel, task.thinking),
					contextPercent: Math.round(action.state.contextUsage?.percent ?? task.contextPercent),
					status: action.state.isStreaming ? "running" : "waiting",
					sessionPath: action.state.sessionFile ?? task.sessionPath,
				})),
				runtimes: updateRuntime(state, action.taskId, runtime => ({
					...runtime,
					sessionId: action.state.sessionId,
				})),
			};
		case "rpc.messages":
			return {
				...state,
				conversations: { ...state.conversations, [action.taskId]: projectMessages(action.messages) },
			};
		case "rpc.agent_event": {
			const event = isRecord(action.event) ? action.event : {};
			const status =
				event.type === "agent_start" || event.type === "turn_start"
					? "running"
					: event.type === "agent_end"
						? "review"
						: undefined;
			return {
				...state,
				tasks: status ? updateTask(state, action.taskId, task => ({ ...task, status })) : state.tasks,
				conversations: {
					...state.conversations,
					[action.taskId]: projectAgentEvent(state.conversations[action.taskId] ?? [], action.event),
				},
			};
		}
		case "rpc.subagents": {
			const agents = projectSubagents(action.subagents);
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({ ...task, agentCount: agents.length })),
				agents: { ...state.agents, [action.taskId]: agents },
			};
		}
		case "rpc.git_loading":
			return { ...state, git: { ...state.git, [action.taskId]: { status: "loading" } } };
		case "rpc.git_snapshot": {
			const selectedPath = state.git[action.taskId]?.selectedPath;
			const nextSelectedPath = action.snapshot.entries.some(entry => entry.path === selectedPath)
				? selectedPath
				: action.snapshot.entries[0]?.path;
			const additions = action.snapshot.entries.reduce((total, entry) => total + entry.additions, 0);
			const deletions = action.snapshot.entries.reduce((total, entry) => total + entry.deletions, 0);
			return {
				...state,
				tasks: updateTask(state, action.taskId, task => ({
					...task,
					branch: action.snapshot.branch,
					additions,
					deletions,
				})),
				git: {
					...state.git,
					[action.taskId]: {
						status: "ready",
						snapshot: action.snapshot,
						selectedPath: nextSelectedPath,
						diffLoading: false,
					},
				},
			};
		}
		case "rpc.git_error":
			return { ...state, git: { ...state.git, [action.taskId]: { status: "error", error: action.error } } };
		case "rpc.git_path_selected":
			return {
				...state,
				git: {
					...state.git,
					[action.taskId]: {
						...state.git[action.taskId],
						status: "ready",
						selectedPath: action.path,
						diff: undefined,
						diffLoading: true,
					},
				},
			};
		case "rpc.git_diff":
			return {
				...state,
				git: {
					...state.git,
					[action.taskId]: {
						...state.git[action.taskId],
						status: "ready",
						selectedPath: action.path,
						diff: action.diff,
						diffLoading: false,
					},
				},
			};
		case "terminal.starting":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, () => ({
					status: "starting",
					output: "",
					outputOffset: 0,
					generation: action.generation,
				})),
			};
		case "terminal.started":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation && terminal.status === "starting"
						? {
								...terminal,
								status: "running",
								exitCode: undefined,
								error: undefined,
							}
						: terminal,
				),
			};
		case "terminal.stopping":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation && terminal.status === "running"
						? { ...terminal, status: "stopping", error: undefined }
						: terminal,
				),
			};
		case "terminal.output":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation
						? { ...terminal, ...appendTerminalOutput(terminal, action.chunk) }
						: terminal,
				),
			};
		case "terminal.exited":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation
						? { ...terminal, status: "exited", exitCode: action.code }
						: terminal,
				),
			};
		case "terminal.stop_failed":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation && terminal.status === "stopping"
						? { ...terminal, status: "running", error: action.error }
						: terminal,
				),
			};
		case "terminal.failed":
			return {
				...state,
				terminals: updateTerminal(state, action.taskId, terminal =>
					terminal.generation === action.generation
						? { ...terminal, status: "error", error: action.error }
						: terminal,
				),
			};
		case "rpc.ui_effect": {
			const effect = action.effect;
			switch (effect.method) {
				case "setTitle":
					return {
						...state,
						tasks: updateTask(state, action.taskId, task => ({ ...task, title: effect.title })),
					};
				case "set_editor_text":
					return {
						...state,
						composerDrafts: { ...state.composerDrafts, [action.taskId]: effect.text },
					};
				case "notify":
					return {
						...state,
						conversations: {
							...state.conversations,
							[action.taskId]: [
								...(state.conversations[action.taskId] ?? []),
								{
									id: `notice-${effect.id}`,
									kind: "notice",
									title: effect.notifyType === "error" ? "OMP error" : "OMP notice",
									body: effect.message,
									meta: effect.notifyType,
								},
							],
						},
					};
				case "open_url":
					return {
						...state,
						conversations: {
							...state.conversations,
							[action.taskId]: [
								...(state.conversations[action.taskId] ?? []),
								{
									id: `url-${effect.id}`,
									kind: "notice",
									title: "Open in browser",
									body: [effect.instructions, effect.launchUrl ?? effect.url].filter(Boolean).join("\n"),
									meta: "External URL requires your action",
								},
							],
						},
					};
				default:
					return state;
			}
		}
	}
}

export const initialDesktopState: DesktopState = {
	selectedTaskId: "build-desktop",
	activeWorkbenchTab: "changes",
	tasks: [
		{
			id: "build-desktop",
			projectId: "project-desktop-agent-ui",
			workspaceId: "omp",
			title: "Build the desktop task center",
			status: "running",
			mode: "worktree",
			model: "GLM-5.2",
			thinking: "high",
			cwd: ".worktrees/desktop-agent-ui",
			branch: "codex/desktop-agent-ui",
			elapsed: "12m",
			contextPercent: 3,
			additions: 428,
			deletions: 36,
			agentCount: 2,
			archived: false,
			lastOpenedAt: 1_786_204_000_000,
			launchConfig: { cwd: ".worktrees/desktop-agent-ui" },
		},
		{
			id: "session-index",
			projectId: "project-coding-agent",
			workspaceId: "omp",
			title: "Index persisted sessions",
			status: "review",
			mode: "direct",
			model: "GLM-5.2",
			thinking: "medium",
			cwd: "packages/coding-agent",
			branch: "main",
			elapsed: "28m",
			contextPercent: 18,
			additions: 92,
			deletions: 12,
			agentCount: 0,
			archived: false,
			lastOpenedAt: 1_786_203_000_000,
			launchConfig: { cwd: "packages/coding-agent" },
		},
		{
			id: "approval-flow",
			projectId: "project-approval-flow",
			workspaceId: "omp",
			title: "Audit tool approval flow",
			status: "completed",
			mode: "worktree",
			model: "Claude Sonnet 4.5",
			thinking: "high",
			cwd: ".worktrees/approval-flow",
			branch: "codex/approval-flow",
			elapsed: "41m",
			contextPercent: 24,
			additions: 164,
			deletions: 71,
			agentCount: 1,
			archived: false,
			lastOpenedAt: 1_786_202_000_000,
			launchConfig: { cwd: ".worktrees/approval-flow" },
		},
	],
	conversations: {
		"build-desktop": [
			{
				id: "prompt-1",
				kind: "user",
				body: "Build the first desktop task-center slice from the approved OMP design.",
				meta: "You · 12m ago",
			},
			{
				id: "assistant-1",
				kind: "assistant",
				title: "Implementing the desktop shell",
				body: "I’ll establish the typed view state first, then assemble the task rail, streaming conversation surface, and review workbench around the CLI-derived visual tokens.",
				meta: "OMP · GLM-5.2 · high",
			},
			{
				id: "tool-1",
				kind: "tool",
				title: "Inspect package structure",
				body: "packages/coding-agent  packages/collab-web  packages/tui",
				meta: "read · completed in 0.8s",
				status: "complete",
			},
			{
				id: "tool-2",
				kind: "tool",
				title: "Create desktop foundation",
				body: "Writing state contracts and the responsive application frame…",
				meta: "write · running",
				status: "running",
			},
		],
		"session-index": [
			{
				id: "session-summary",
				kind: "assistant",
				title: "Session index is ready for review",
				body: "Added a stable task-to-JSONL index and recovery metadata. The final diff is available in Changes.",
				meta: "OMP · GLM-5.2 · medium",
			},
		],
		"approval-flow": [
			{
				id: "approval-summary",
				kind: "notice",
				title: "Task completed",
				body: "Approval requests now fail closed and retain an audit record when the desktop disconnects.",
				meta: "41m total",
			},
		],
	},
	runtimes: {
		"build-desktop": { status: "preview", stderr: [] },
		"session-index": { status: "preview", stderr: [] },
		"approval-flow": { status: "preview", stderr: [] },
	},
	agents: {
		"build-desktop": [
			{ id: "fixture-state", label: "UI state contracts", status: "completed" },
			{ id: "fixture-visual", label: "Visual system", status: "running" },
		],
		"session-index": [],
		"approval-flow": [{ id: "fixture-approval", label: "Approval audit", status: "completed" }],
	},
	git: {
		"build-desktop": { status: "idle" },
		"session-index": { status: "idle" },
		"approval-flow": { status: "idle" },
	},
	terminals: {
		"build-desktop": { status: "offline", output: "", outputOffset: 0 },
		"session-index": { status: "offline", output: "", outputOffset: 0 },
		"approval-flow": { status: "offline", output: "", outputOffset: 0 },
	},
	composerDrafts: {
		"build-desktop": "",
		"session-index": "",
		"approval-flow": "",
	},
};
