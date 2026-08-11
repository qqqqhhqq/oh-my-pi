import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useReducer, useRef, useState } from "react";
import { ConversationPane } from "../components/conversation/ConversationPane";
import { AppTitlebar } from "../components/runtime/AppTitlebar";
import { ConnectionDialog } from "../components/runtime/ConnectionDialog";
import { ExtensionRequestDialog } from "../components/runtime/ExtensionRequestDialog";
import { SessionComposer, type SessionComposerDraft } from "../components/tasks/SessionComposer";
import { TaskActionDialog } from "../components/tasks/TaskActionDialog";
import { TaskRail } from "../components/tasks/TaskRail";
import { Workbench } from "../components/workbench/Workbench";
import type { RpcLaunchConfig, RpcModelInfo } from "../rpc/rpc-session";
import { useDesktopRpc } from "../rpc/use-desktop-rpc";
import { openWorkspaceInEditor } from "../runtime/editor";
import { selectStartupTask, shouldAutoStartBackend, shouldCreateDefaultSession } from "../runtime/startup-task";
import { createDesktopStateFromCatalog, desktopReducer, initialDesktopState } from "../state/desktop-state";
import { createDesktopProject, workspaceName } from "../state/project-factory";
import { loadTaskCatalog, saveTaskCatalog, TASK_CATALOG_KEY } from "../state/task-catalog";
import { createDesktopTask } from "../state/task-factory";
import { useDesktopTerminal } from "../terminal/use-desktop-terminal";

function loadInitialDesktop() {
	if (!isTauri() || typeof window === "undefined") {
		return {
			state: initialDesktopState,
			projects: [
				{ id: "project-desktop-agent-ui", title: "desktop-agent-ui", cwd: ".worktrees/desktop-agent-ui" },
				{ id: "project-coding-agent", title: "coding-agent", cwd: "packages/coding-agent" },
				{ id: "project-approval-flow", title: "approval-flow", cwd: ".worktrees/approval-flow" },
			],
			catalogError: undefined,
		};
	}
	const result = loadTaskCatalog(window.localStorage);
	if (result.kind === "invalid") {
		return { state: createDesktopStateFromCatalog([]), projects: [], catalogError: result.error };
	}
	return { state: createDesktopStateFromCatalog(result.tasks), projects: result.projects, catalogError: undefined };
}

export function App() {
	const [initialDesktop] = useState(loadInitialDesktop);
	const [state, dispatch] = useReducer(desktopReducer, initialDesktop.state);
	const [projects, setProjects] = useState(initialDesktop.projects);
	const rpc = useDesktopRpc(dispatch);
	const terminalController = useDesktopTerminal(dispatch);
	const [catalogError, setCatalogError] = useState(initialDesktop.catalogError);
	const [connectionOpen, setConnectionOpen] = useState(false);
	const [connectionBusy, setConnectionBusy] = useState(false);
	const [connectionError, setConnectionError] = useState<string>();
	const [sessionComposerOpen, setSessionComposerOpen] = useState(false);
	const [sessionComposerTaskId, setSessionComposerTaskId] = useState<string>();
	const [newTaskBusy, setNewTaskBusy] = useState(false);
	const [newTaskError, setNewTaskError] = useState<string>();
	const [availableModels, setAvailableModels] = useState<RpcModelInfo[]>([]);
	const [composerInitialProjectId, setComposerInitialProjectId] = useState<string>();
	const [taskActionsOpen, setTaskActionsOpen] = useState(false);
	const [taskActionBusy, setTaskActionBusy] = useState(false);
	const [taskActionError, setTaskActionError] = useState<string>();
	const didAutoConnect = useRef(false);
	const selectedTask = state.tasks.find(task => task.id === state.selectedTaskId);
	const runtime = selectedTask
		? (state.runtimes[selectedTask.id] ?? { status: "disconnected", stderr: [] })
		: { status: "disconnected" as const, stderr: [] };

	useEffect(() => {
		if (!isTauri() || typeof window === "undefined" || catalogError) return;
		saveTaskCatalog(window.localStorage, state.tasks, projects);
	}, [catalogError, projects, state.tasks]);

	useEffect(() => {
		if (
			!isTauri() ||
			!shouldAutoStartBackend({
				available: rpc.runtimeInfo.available,
				catalogError,
				hasStarted: didAutoConnect.current,
			})
		) {
			return;
		}
		didAutoConnect.current = true;
		const task = selectStartupTask(state.tasks, state.selectedTaskId);
		if (task) {
			void rpc.connect(task.id, task.launchConfig, task.sessionPath).catch(() => {});
			return;
		}
		if (!shouldCreateDefaultSession(projects.length > 0)) return;
		if (!rpc.runtimeInfo.defaultWorkspace) return;
		const project = createDesktopProject(
			{ title: "", cwd: rpc.runtimeInfo.defaultWorkspace },
			globalThis.crypto.randomUUID(),
		);
		setProjects(existing => [...existing, project]);
		const created = createDesktopTask(
			{
				projectId: project.id,
				title: "",
				cwd: project.cwd,
			},
			globalThis.crypto.randomUUID(),
			Date.now(),
		);
		dispatch({ type: "task.created", task: created });
		void rpc.connect(created.id, created.launchConfig).catch(() => {});
	}, [catalogError, projects.length, rpc, state.selectedTaskId, state.tasks]);

	const agents = selectedTask ? (state.agents[selectedTask.id] ?? []) : [];
	const git = selectedTask ? (state.git[selectedTask.id] ?? { status: "idle" as const }) : { status: "idle" as const };

	// Load the connected session's model catalog for the composer's model picker.
	useEffect(() => {
		if (!sessionComposerOpen) return;
		const connectedTask = state.tasks.find(task => state.runtimes[task.id]?.status === "connected");
		if (!connectedTask) {
			setAvailableModels([]);
			return;
		}
		void rpc
			.getAvailableModels(connectedTask.id)
			.then(models => setAvailableModels(models))
			.catch(() => setAvailableModels([]));
	}, [sessionComposerOpen, rpc, state.runtimes, state.tasks]);
	const terminal = selectedTask
		? (state.terminals[selectedTask.id] ?? { status: "offline" as const, output: "", outputOffset: 0 })
		: { status: "offline" as const, output: "", outputOffset: 0 };
	const uiRequest = selectedTask ? rpc.uiRequests[selectedTask.id] : undefined;

	async function connect(taskId: string, config: RpcLaunchConfig, restoreSession: boolean) {
		setConnectionBusy(true);
		setConnectionError(undefined);
		try {
			const sessionPath = restoreSession ? state.tasks.find(task => task.id === taskId)?.sessionPath : undefined;
			if (!restoreSession) dispatch({ type: "task.session_file_changed", taskId, sessionPath: undefined });
			const task = state.tasks.find(item => item.id === taskId);
			const project = task ? projects.find(item => item.id === task.projectId) : undefined;
			await rpc.connect(taskId, project ? { ...config, cwd: project.cwd } : config, sessionPath);
			setConnectionOpen(false);
		} catch (error) {
			setConnectionError(error instanceof Error ? error.message : String(error));
		} finally {
			setConnectionBusy(false);
		}
	}

	async function createTask(draft: SessionComposerDraft) {
		const project = projects.find(item => item.id === draft.projectId);
		if (!project) {
			setNewTaskError("Choose a local project before creating a session.");
			return;
		}
		setNewTaskBusy(true);
		setNewTaskError(undefined);
		const existingTask = sessionComposerTaskId
			? state.tasks.find(task => task.id === sessionComposerTaskId)
			: undefined;
		const launchConfig: RpcLaunchConfig = {
			cwd: project.cwd,
			...(draft.provider ? { provider: draft.provider } : {}),
			...(draft.model ? { model: draft.model } : {}),
			...(draft.approvalMode ? { approvalMode: draft.approvalMode } : {}),
			...(draft.thinking ? { thinking: draft.thinking } : {}),
		};
		const task =
			existingTask ??
			createDesktopTask(
				{
					projectId: draft.projectId,
					cwd: project.cwd,
					provider: draft.provider,
					model: draft.model,
					approvalMode: draft.approvalMode,
					thinking: draft.thinking,
				},
				globalThis.crypto.randomUUID(),
				Date.now(),
			);
		if (!existingTask) {
			dispatch({ type: "task.created", task });
			setSessionComposerTaskId(task.id);
		} else {
			dispatch({
				type: "task.reconfigured",
				taskId: task.id,
				projectId: project.id,
				title: workspaceName(project.cwd),
				config: launchConfig,
			});
		}
		try {
			if (existingTask) await rpc.disconnect(task.id);
			await rpc.connect(task.id, launchConfig);
			await rpc.prompt(task.id, draft.prompt);
			setSessionComposerOpen(false);
			setSessionComposerTaskId(undefined);
		} catch (error) {
			setNewTaskError(error instanceof Error ? error.message : String(error));
		} finally {
			setNewTaskBusy(false);
		}
	}

	async function openProjectFolder() {
		if (!isTauri()) return;
		try {
			const selected = await open({ title: "Choose a project folder", directory: true, multiple: false });
			if (typeof selected !== "string") return;
			const cwd = selected;
			if (projects.some(project => project.cwd.toLocaleLowerCase() === cwd.toLocaleLowerCase())) {
				const existing = projects.find(project => project.cwd.toLocaleLowerCase() === cwd.toLocaleLowerCase());
				if (existing) setComposerInitialProjectId(existing.id);
				return;
			}
			const project = createDesktopProject({ title: workspaceName(cwd), cwd }, globalThis.crypto.randomUUID());
			setProjects(existing => [...existing, project]);
			// A composer waiting for a project picks up the freshly opened folder.
			setComposerInitialProjectId(project.id);
		} catch (error) {
			setNewTaskError(error instanceof Error ? error.message : String(error));
		}
	}

	async function attachContext(taskId: string) {
		if (!isTauri()) return;
		try {
			const selected = await open({ title: "Add context files", directory: false, multiple: true });
			const files = Array.isArray(selected) ? selected : selected ? [selected] : [];
			if (files.length === 0) return;
			const current = state.composerDrafts[taskId] ?? "";
			const contextBlock = `Context files:\n${files.map(file => `- ${file}`).join("\n")}`;
			dispatch({
				type: "composer.changed",
				taskId,
				value: current.trim() ? `${current.trim()}\n\n${contextBlock}` : contextBlock,
			});
		} catch (error) {
			dispatch({
				type: "rpc.ui_effect",
				taskId,
				effect: {
					type: "extension_ui_request",
					id: `context-picker-${Date.now()}`,
					method: "notify",
					message: error instanceof Error ? error.message : String(error),
					notifyType: "error",
				},
			});
		}
	}

	async function archiveSelected(archived: boolean) {
		if (!selectedTask) return;
		setTaskActionBusy(true);
		setTaskActionError(undefined);
		try {
			await terminalController.stop(selectedTask.id);
			await rpc.disconnect(selectedTask.id);
			dispatch({ type: "task.archived", taskId: selectedTask.id, archived });
			setTaskActionsOpen(false);
		} catch (error) {
			setTaskActionError(error instanceof Error ? error.message : String(error));
		} finally {
			setTaskActionBusy(false);
		}
	}

	async function deleteSelected() {
		if (!selectedTask) return;
		setTaskActionBusy(true);
		setTaskActionError(undefined);
		try {
			await terminalController.stop(selectedTask.id);
			await rpc.disconnect(selectedTask.id);
			dispatch({ type: "task.deleted", taskId: selectedTask.id });
			setTaskActionsOpen(false);
		} catch (error) {
			setTaskActionError(error instanceof Error ? error.message : String(error));
		} finally {
			setTaskActionBusy(false);
		}
	}

	function resetCatalog() {
		if (typeof window !== "undefined") window.localStorage.removeItem(TASK_CATALOG_KEY);
		setProjects([]);
		setCatalogError(undefined);
	}

	return (
		<>
			<AppTitlebar native={isTauri()} />
			<main className="desktop-shell" data-theme="light">
				<TaskRail
					state={state}
					projects={projects}
					runtime={runtime}
					rpcAvailable={rpc.runtimeInfo.available}
					onNewTask={() => {
						setComposerInitialProjectId(undefined);
						setSessionComposerOpen(true);
					}}
					onQuickNewSession={projectId => {
						setComposerInitialProjectId(projectId);
						setSessionComposerOpen(true);
					}}
					onSelectTask={taskId => {
						// Clicking a session leaves the new-task composer and opens that session.
						setSessionComposerOpen(false);
						setSessionComposerTaskId(undefined);
						dispatch({ type: "task.selected", taskId, openedAt: Date.now() });
					}}
					onArchiveTask={(taskId, archived) => {
						if (taskId === selectedTask?.id && archived) void rpc.disconnect(taskId);
						dispatch({ type: "task.archived", taskId, archived });
					}}
					onToggleFavorite={(taskId, favorite) => dispatch({ type: "task.favorited", taskId, favorite })}
					onConnect={() => setConnectionOpen(true)}
					onDisconnect={() => selectedTask && void rpc.disconnect(selectedTask.id)}
				/>
				{sessionComposerOpen ? (
					<>
						<SessionComposer
							projects={projects}
							initialProjectId={composerInitialProjectId}
							busy={newTaskBusy}
							error={newTaskError}
							onCreate={createTask}
							onOpenProject={() => void openProjectFolder()}
							availableModels={availableModels}
							context={
								selectedTask
									? {
											model: selectedTask.model,
											percent: selectedTask.contextPercent,
											tokens: selectedTask.contextTokens,
											contextWindow: selectedTask.contextWindow,
											modelCost: selectedTask.modelCost,
										}
									: undefined
							}
						/>
						{selectedTask && (
							<Workbench
								task={selectedTask}
								activeTab={state.activeWorkbenchTab}
								onSelectTab={tab => dispatch({ type: "workbench.selected", tab })}
								runtime={runtime}
								agents={agents}
								git={git}
								onRefreshGit={() => rpc.refreshGit(selectedTask.id)}
								onSelectGitPath={path => rpc.loadGitDiff(selectedTask.id, path)}
								onStageGitChanges={paths => rpc.stageGitChanges(selectedTask.id, paths)}
								onDiscardGitChanges={paths => rpc.discardGitChanges(selectedTask.id, paths)}
								onOpenEditor={() => openWorkspaceInEditor(selectedTask.cwd)}
								terminalAvailable={terminalController.available}
								terminal={terminal}
								onStartTerminal={(rows, cols) =>
									terminalController.start(selectedTask.id, selectedTask.cwd, rows, cols)
								}
								onWriteTerminal={data => terminalController.write(selectedTask.id, data)}
								onWriteTerminalBinary={data => terminalController.writeBinary(selectedTask.id, data)}
								onInterruptTerminal={() => terminalController.interrupt(selectedTask.id)}
								onResizeTerminal={(rows, cols) => terminalController.resize(selectedTask.id, rows, cols)}
								onStopTerminal={() => terminalController.stop(selectedTask.id)}
							/>
						)}
					</>
				) : selectedTask ? (
					<>
						<ConversationPane
							task={selectedTask}
							entries={state.conversations[selectedTask.id] ?? []}
							runtime={runtime}
							draft={state.composerDrafts[selectedTask.id] ?? ""}
							onDraftChange={value => dispatch({ type: "composer.changed", taskId: selectedTask.id, value })}
							onPrompt={message => rpc.prompt(selectedTask.id, message)}
							onSteer={message => rpc.steer(selectedTask.id, message)}
							onAttachContext={isTauri() ? () => attachContext(selectedTask.id) : undefined}
							onAbort={() => rpc.abort(selectedTask.id)}
							onRefresh={() => rpc.refresh(selectedTask.id)}
							onManageTask={() => setTaskActionsOpen(true)}
						/>
						<Workbench
							task={selectedTask}
							activeTab={state.activeWorkbenchTab}
							onSelectTab={tab => dispatch({ type: "workbench.selected", tab })}
							runtime={runtime}
							agents={agents}
							git={git}
							onRefreshGit={() => rpc.refreshGit(selectedTask.id)}
							onSelectGitPath={path => rpc.loadGitDiff(selectedTask.id, path)}
							onStageGitChanges={paths => rpc.stageGitChanges(selectedTask.id, paths)}
							onDiscardGitChanges={paths => rpc.discardGitChanges(selectedTask.id, paths)}
							onOpenEditor={() => openWorkspaceInEditor(selectedTask.cwd)}
							terminalAvailable={terminalController.available}
							terminal={terminal}
							onStartTerminal={(rows, cols) =>
								terminalController.start(selectedTask.id, selectedTask.cwd, rows, cols)
							}
							onWriteTerminal={data => terminalController.write(selectedTask.id, data)}
							onWriteTerminalBinary={data => terminalController.writeBinary(selectedTask.id, data)}
							onInterruptTerminal={() => terminalController.interrupt(selectedTask.id)}
							onResizeTerminal={(rows, cols) => terminalController.resize(selectedTask.id, rows, cols)}
							onStopTerminal={() => terminalController.stop(selectedTask.id)}
						/>
					</>
				) : (
					<section className="desktop-empty-state">
						<div>
							<h1>{catalogError ? "Task catalog needs attention" : "Create your first OMP task"}</h1>
							<p>
								{catalogError
									? "The saved catalog was preserved because its format could not be read. Reset it to continue."
									: "Choose a workspace to start an isolated local coding session."}
							</p>
							{catalogError ? (
								<button className="primary-button" type="button" onClick={resetCatalog}>
									Reset task catalog
								</button>
							) : (
								<button
									className="primary-button"
									type="button"
									disabled={!rpc.runtimeInfo.available}
									onClick={() => void openProjectFolder()}
								>
									Add local project
								</button>
							)}
						</div>
					</section>
				)}
				{selectedTask && (
					<ConnectionDialog
						open={connectionOpen}
						runtimeInfo={rpc.runtimeInfo}
						initialConfig={selectedTask.launchConfig}
						workspaceReadOnly={projects.some(project => project.id === selectedTask.projectId)}
						sessionPath={selectedTask.sessionPath}
						restoreFailed={runtime.restoreFailed}
						busy={connectionBusy}
						error={connectionError}
						onClose={() => setConnectionOpen(false)}
						onConnect={(config, restoreSession) => connect(selectedTask.id, config, restoreSession)}
					/>
				)}
				{selectedTask && (
					<TaskActionDialog
						task={selectedTask}
						open={taskActionsOpen}
						busy={taskActionBusy}
						error={taskActionError}
						onClose={() => setTaskActionsOpen(false)}
						onRename={async title => {
							dispatch({ type: "task.renamed", taskId: selectedTask.id, title });
							setTaskActionsOpen(false);
						}}
						onArchive={archiveSelected}
						onDelete={deleteSelected}
					/>
				)}
				{selectedTask && uiRequest && (
					<ExtensionRequestDialog
						request={uiRequest}
						onResponse={response => rpc.respondToUi(selectedTask.id, response)}
					/>
				)}
			</main>
		</>
	);
}
