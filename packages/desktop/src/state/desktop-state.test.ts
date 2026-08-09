import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopStateFromCatalog, type DesktopState, desktopReducer } from "./desktop-state.ts";

const baseState: DesktopState = {
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
			lastOpenedAt: 100,
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
			lastOpenedAt: 200,
			launchConfig: { cwd: "packages/coding-agent" },
		},
	],
	conversations: {
		"build-desktop": [],
		"session-index": [],
	},
	runtimes: {
		"build-desktop": { status: "preview", stderr: [] },
		"session-index": { status: "preview", stderr: [] },
	},
	agents: {
		"build-desktop": [],
		"session-index": [],
	},
	git: {
		"build-desktop": { status: "idle" },
		"session-index": { status: "idle" },
	},
	terminals: {
		"build-desktop": { status: "offline", output: "", outputOffset: 0 },
		"session-index": { status: "offline", output: "", outputOffset: 0 },
	},
	composerDrafts: {
		"build-desktop": "",
		"session-index": "",
	},
};

test("selecting a known task changes only the active task", () => {
	const next = desktopReducer(baseState, { type: "task.selected", taskId: "session-index" });

	assert.equal(next.selectedTaskId, "session-index");
	assert.equal(next.activeWorkbenchTab, "changes");
	assert.equal(next.tasks, baseState.tasks);
});

test("selecting an unknown task preserves the current state", () => {
	const next = desktopReducer(baseState, { type: "task.selected", taskId: "missing" });

	assert.equal(next, baseState);
});

test("switching workbench tabs preserves the selected task", () => {
	const next = desktopReducer(baseState, { type: "workbench.selected", tab: "terminal" });

	assert.equal(next.activeWorkbenchTab, "terminal");
	assert.equal(next.selectedTaskId, "build-desktop");
});

test("connecting a fixture task clears preview content and records the workspace", () => {
	const next = desktopReducer(baseState, {
		type: "rpc.connecting",
		taskId: "build-desktop",
		config: {
			cwd: "C:/workspace/oh-my-pi",
			executable: "omp",
			provider: "openai",
			model: "gpt-5.2-codex",
		},
	});

	assert.equal(next.runtimes["build-desktop"]?.status, "connecting");
	assert.equal(next.tasks[0]?.cwd, "C:/workspace/oh-my-pi");
	assert.deepEqual(next.tasks[0]?.launchConfig, {
		cwd: "C:/workspace/oh-my-pi",
		executable: "omp",
		provider: "openai",
		model: "gpt-5.2-codex",
	});
	assert.deepEqual(next.conversations["build-desktop"], []);
});

test("reconfiguring a pending task updates its project and launch context", () => {
	const state: DesktopState = {
		...baseState,
		tasks: [{ ...baseState.tasks[0]!, sessionPath: "C:/projects/old/session.jsonl" }, baseState.tasks[1]!],
		git: {
			...baseState.git,
			"build-desktop": { status: "ready", selectedPath: "src/old-project.ts", diff: "old project diff" },
		},
	};
	const next = desktopReducer(state, {
		type: "task.reconfigured",
		taskId: "build-desktop",
		projectId: "project-coding-agent",
		title: "Inspect the coding agent",
		config: {
			cwd: "packages/coding-agent",
			executable: "omp",
			provider: "openai",
			model: "gpt-5.2-codex",
		},
	});

	assert.deepEqual(next.tasks[0], {
		...state.tasks[0],
		projectId: "project-coding-agent",
		title: "Inspect the coding agent",
		workspaceId: "coding-agent",
		cwd: "packages/coding-agent",
		model: "gpt-5.2-codex",
		launchConfig: {
			cwd: "packages/coding-agent",
			executable: "omp",
			provider: "openai",
			model: "gpt-5.2-codex",
		},
		sessionPath: undefined,
	});
	assert.deepEqual(next.git["build-desktop"], { status: "idle" });
});

test("reconfiguring without a title derives it from the new local project", () => {
	const next = desktopReducer(baseState, {
		type: "task.reconfigured",
		taskId: "build-desktop",
		projectId: "project-coding-agent",
		title: "",
		config: { cwd: "packages/coding-agent" },
	});

	assert.equal(next.tasks[0]?.title, "Work in coding-agent");
});

test("RPC state updates model, thinking, context, and streaming status", () => {
	const next = desktopReducer(baseState, {
		type: "rpc.state",
		taskId: "build-desktop",
		state: {
			model: { id: "gpt-5.2-codex" },
			thinkingLevel: "high",
			isStreaming: true,
			sessionId: "session-1",
			sessionFile: "C:/sessions/session-1.jsonl",
			contextUsage: { percent: 42 },
		},
	});

	assert.equal(next.tasks[0]?.model, "gpt-5.2-codex");
	assert.equal(next.tasks[0]?.thinking, "high");
	assert.equal(next.tasks[0]?.contextPercent, 42);
	assert.equal(next.tasks[0]?.status, "running");
	assert.equal(next.tasks[0]?.sessionPath, "C:/sessions/session-1.jsonl");
	assert.equal(next.runtimes["build-desktop"]?.sessionId, "session-1");
});

test("a failed session restore remains recoverable without deleting durable metadata", () => {
	const state: DesktopState = {
		...baseState,
		tasks: [{ ...baseState.tasks[0]!, sessionPath: "C:/sessions/stale.jsonl" }, baseState.tasks[1]!],
	};
	const next = desktopReducer(state, {
		type: "rpc.restore_failed",
		taskId: "build-desktop",
		error: "Session file does not exist",
	});

	assert.equal(next.tasks[0]?.sessionPath, "C:/sessions/stale.jsonl");
	assert.equal(next.runtimes["build-desktop"]?.restoreFailed, true);
	assert.equal(next.runtimes["build-desktop"]?.error, "Session file does not exist");
});

test("Git snapshots update only the target task review metadata", () => {
	const next = desktopReducer(baseState, {
		type: "rpc.git_snapshot",
		taskId: "build-desktop",
		snapshot: {
			repoRoot: "C:/workspace/oh-my-pi",
			branch: "codex/desktop-agent-ui",
			entries: [
				{
					path: "src/app.ts",
					indexStatus: " ",
					worktreeStatus: "M",
					kind: "modified",
					additions: 8,
					deletions: 3,
				},
			],
		},
	});

	assert.equal(next.git["build-desktop"]?.status, "ready");
	assert.equal(next.git["build-desktop"]?.selectedPath, "src/app.ts");
	assert.equal(next.tasks[0]?.branch, "codex/desktop-agent-ui");
	assert.equal(next.tasks[0]?.additions, 8);
	assert.equal(next.tasks[0]?.deletions, 3);
	assert.equal(next.git["session-index"]?.status, "idle");
});

test("terminal output and exit state remain scoped to their task", () => {
	const starting = desktopReducer(baseState, { type: "terminal.starting", taskId: "build-desktop", generation: 1 });
	const started = desktopReducer(starting, { type: "terminal.started", taskId: "build-desktop", generation: 1 });
	const output = desktopReducer(started, {
		type: "terminal.output",
		taskId: "build-desktop",
		generation: 1,
		chunk: "π ready\n",
	});
	const exited = desktopReducer(output, { type: "terminal.exited", taskId: "build-desktop", generation: 1, code: 0 });

	assert.equal(exited.terminals["build-desktop"]?.status, "exited");
	assert.equal(exited.terminals["build-desktop"]?.output, "π ready\n");
	assert.equal(exited.terminals["build-desktop"]?.exitCode, 0);
	assert.deepEqual(exited.terminals["session-index"], { status: "offline", output: "", outputOffset: 0 });
});

test("a stopping terminal keeps accepting drained output until the native exit event", () => {
	const starting = desktopReducer(baseState, { type: "terminal.starting", taskId: "build-desktop", generation: 7 });
	const started = desktopReducer(starting, { type: "terminal.started", taskId: "build-desktop", generation: 7 });
	const stopping = desktopReducer(started, { type: "terminal.stopping", taskId: "build-desktop", generation: 7 });
	const drained = desktopReducer(stopping, {
		type: "terminal.output",
		taskId: "build-desktop",
		generation: 7,
		chunk: "final output\n",
	});
	const exited = desktopReducer(drained, {
		type: "terminal.exited",
		taskId: "build-desktop",
		generation: 7,
		code: null,
	});

	assert.equal(stopping.terminals["build-desktop"]?.status, "stopping");
	assert.equal(drained.terminals["build-desktop"]?.output, "final output\n");
	assert.equal(exited.terminals["build-desktop"]?.status, "exited");
});

test("terminal generations reject stale output and preserve an early exit", () => {
	const first = desktopReducer(baseState, { type: "terminal.starting", taskId: "build-desktop", generation: 1 });
	const second = desktopReducer(first, { type: "terminal.starting", taskId: "build-desktop", generation: 2 });
	const staleOutput = desktopReducer(second, {
		type: "terminal.output",
		taskId: "build-desktop",
		generation: 1,
		chunk: "stale",
	});
	const exited = desktopReducer(staleOutput, {
		type: "terminal.exited",
		taskId: "build-desktop",
		generation: 2,
		code: 0,
	});
	const lateStarted = desktopReducer(exited, {
		type: "terminal.started",
		taskId: "build-desktop",
		generation: 2,
	});

	assert.equal(staleOutput.terminals["build-desktop"]?.output, "");
	assert.equal(lateStarted.terminals["build-desktop"]?.status, "exited");
});

test("extension title and editor effects update only their task", () => {
	const titled = desktopReducer(baseState, {
		type: "rpc.ui_effect",
		taskId: "build-desktop",
		effect: { type: "extension_ui_request", id: "title-1", method: "setTitle", title: "Review CLI parity" },
	});
	const drafted = desktopReducer(titled, {
		type: "rpc.ui_effect",
		taskId: "build-desktop",
		effect: { type: "extension_ui_request", id: "draft-1", method: "set_editor_text", text: "Check the diff" },
	});

	assert.equal(drafted.tasks[0]?.title, "Review CLI parity");
	assert.equal(drafted.tasks[1]?.title, "Index persisted sessions");
	assert.equal(drafted.composerDrafts["build-desktop"], "Check the diff");
});

test("extension notifications are projected into the task transcript", () => {
	const next = desktopReducer(baseState, {
		type: "rpc.ui_effect",
		taskId: "build-desktop",
		effect: {
			type: "extension_ui_request",
			id: "notice-1",
			method: "notify",
			message: "Approval was denied",
			notifyType: "warning",
		},
	});

	assert.deepEqual(next.conversations["build-desktop"], [
		{
			id: "notice-notice-1",
			kind: "notice",
			title: "OMP notice",
			body: "Approval was denied",
			meta: "warning",
		},
	]);
});

test("creating a task selects it and initializes isolated runtime collections", () => {
	const created = {
		...baseState.tasks[0]!,
		id: "new-task",
		title: "New desktop task",
		status: "waiting" as const,
		archived: false,
		lastOpenedAt: 1_786_204_100_000,
		launchConfig: { cwd: "C:/workspace/new" },
	};

	const next = desktopReducer(baseState, { type: "task.created", task: created });

	assert.equal(next.selectedTaskId, "new-task");
	assert.deepEqual(next.tasks.at(-1), created);
	assert.deepEqual(next.conversations["new-task"], []);
	assert.deepEqual(next.runtimes["new-task"], { status: "disconnected", stderr: [] });
	assert.deepEqual(next.agents["new-task"], []);
	assert.equal(next.composerDrafts["new-task"], "");
});

test("archiving the selected task falls back to the most recently opened visible task", () => {
	const state: DesktopState = {
		...baseState,
		tasks: [
			{ ...baseState.tasks[0]!, archived: false, lastOpenedAt: 100 },
			{ ...baseState.tasks[1]!, archived: false, lastOpenedAt: 200 },
		],
	};

	const next = desktopReducer(state, { type: "task.archived", taskId: "build-desktop", archived: true });

	assert.equal(next.tasks[0]?.archived, true);
	assert.equal(next.selectedTaskId, "session-index");
});

test("an archived task can be selected from the archived catalog", () => {
	const state: DesktopState = {
		...baseState,
		tasks: [{ ...baseState.tasks[0]!, archived: true }, baseState.tasks[1]!],
	};

	const next = desktopReducer(state, { type: "task.selected", taskId: "build-desktop", openedAt: 300 });

	assert.equal(next.selectedTaskId, "build-desktop");
	assert.equal(next.tasks[0]?.lastOpenedAt, 300);
});

test("deleting a task removes all task-scoped state without deleting another task", () => {
	const next = desktopReducer(baseState, { type: "task.deleted", taskId: "build-desktop" });

	assert.deepEqual(
		next.tasks.map(item => item.id),
		["session-index"],
	);
	assert.equal(next.selectedTaskId, "session-index");
	assert.equal(next.conversations["build-desktop"], undefined);
	assert.equal(next.runtimes["build-desktop"], undefined);
	assert.equal(next.agents["build-desktop"], undefined);
	assert.equal(next.composerDrafts["build-desktop"], undefined);
});

test("hydrating persisted tasks resets process state while preserving durable metadata", () => {
	const state = createDesktopStateFromCatalog([
		{
			id: "saved-task",
			projectId: "project-oh-my-pi",
			workspaceId: "oh-my-pi",
			title: "Saved task",
			mode: "direct",
			model: "gpt-5.2-codex",
			thinking: "high",
			cwd: "C:/workspace/oh-my-pi",
			branch: "codex/desktop-agent-ui",
			archived: false,
			lastOpenedAt: 500,
			launchConfig: { cwd: "C:/workspace/oh-my-pi", executable: "omp" },
			sessionPath: "C:/sessions/saved.jsonl",
		},
	]);

	assert.equal(state.selectedTaskId, "saved-task");
	assert.equal(state.tasks[0]?.status, "waiting");
	assert.equal(state.tasks[0]?.sessionPath, "C:/sessions/saved.jsonl");
	assert.deepEqual(state.runtimes["saved-task"], { status: "disconnected", stderr: [] });
	assert.deepEqual(state.conversations["saved-task"], []);
});
