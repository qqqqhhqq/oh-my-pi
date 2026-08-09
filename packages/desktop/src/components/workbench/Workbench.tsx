import { Bot, Check, ExternalLink, GitBranch, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { OmpIcon } from "../../icons/semantic-icons";
import type {
	DesktopAgent,
	DesktopGitRuntime,
	DesktopTask,
	DesktopTaskRuntime,
	DesktopTerminalRuntime,
	WorkbenchTab,
} from "../../state/desktop-state";
import { TerminalPanel } from "./TerminalPanel";

interface WorkbenchProps {
	task: DesktopTask;
	activeTab: WorkbenchTab;
	onSelectTab: (tab: WorkbenchTab) => void;
	runtime: DesktopTaskRuntime;
	agents: DesktopAgent[];
	git: DesktopGitRuntime;
	onRefreshGit: () => Promise<void>;
	onSelectGitPath: (path: string) => Promise<void>;
	onStageGitChanges: (paths?: string[]) => Promise<void>;
	onDiscardGitChanges: (paths: string[]) => Promise<void>;
	onOpenEditor: () => Promise<void>;
	terminalAvailable: boolean;
	terminal: DesktopTerminalRuntime;
	onStartTerminal: (rows: number, cols: number) => Promise<void>;
	onWriteTerminal: (data: string) => Promise<void>;
	onWriteTerminalBinary: (data: string) => Promise<void>;
	onInterruptTerminal: () => Promise<void>;
	onResizeTerminal: (rows: number, cols: number) => Promise<void>;
	onStopTerminal: () => Promise<void>;
}

const tabs: Array<{ id: WorkbenchTab; label: string }> = [
	{ id: "changes", label: "Changes" },
	{ id: "terminal", label: "Terminal" },
	{ id: "agents", label: "Agents" },
];

const changeStatus = {
	added: "A",
	copied: "C",
	deleted: "D",
	modified: "M",
	renamed: "R",
	untracked: "?",
	conflicted: "U",
} as const;

interface ChangesViewProps {
	live: boolean;
	git: DesktopGitRuntime;
	onRefresh: () => Promise<void>;
	onSelectPath: (path: string) => Promise<void>;
	onStage: (paths?: string[]) => Promise<void>;
	onDiscard: (paths: string[]) => Promise<void>;
	onOpenEditor: () => Promise<void>;
}

function ChangesView({ live, git, onRefresh, onSelectPath, onStage, onDiscard, onOpenEditor }: ChangesViewProps) {
	const [busy, setBusy] = useState(false);
	const [discardTarget, setDiscardTarget] = useState<string>();
	const [operationError, setOperationError] = useState<string>();
	const entries = git.snapshot?.entries ?? [];
	const selected = entries.find(entry => entry.path === git.selectedPath);

	useEffect(() => {
		if (!live || git.status !== "ready" || !selected || git.diff !== undefined || git.diffLoading) return;
		void run(() => onSelectPath(selected.path));
	}, [live, git.status, git.diff, git.diffLoading, selected, onSelectPath]);

	async function run(operation: () => Promise<void>) {
		setBusy(true);
		setOperationError(undefined);
		try {
			await operation();
		} catch (error) {
			setOperationError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	if (!live) {
		return (
			<div className="panel-empty-state">
				<OmpIcon name="changes" />
				<strong>Connect OMP to inspect Git changes</strong>
				<p>The desktop only renders repository data returned by the active local RPC session.</p>
			</div>
		);
	}
	if (git.status === "loading" || git.status === "idle") {
		return (
			<div className="panel-empty-state">
				<span className="activity-spinner" />
				<strong>Loading Git changes</strong>
			</div>
		);
	}
	if (git.status === "error") {
		return (
			<div className="panel-empty-state">
				<OmpIcon name="changes" />
				<strong>Git changes unavailable</strong>
				<p>{git.error}</p>
				<button className="quiet-button" type="button" onClick={() => void run(onRefresh)} disabled={busy}>
					<RefreshCw size={13} /> Retry
				</button>
			</div>
		);
	}
	if (entries.length === 0) {
		return (
			<div className="panel-empty-state">
				<Check size={24} />
				<strong>Working tree is clean</strong>
				<p className="mono">{git.snapshot?.branch}</p>
				<button className="quiet-button" type="button" onClick={() => void run(onRefresh)} disabled={busy}>
					<RefreshCw size={13} /> Refresh
				</button>
			</div>
		);
	}

	return (
		<div className="changes-view">
			<div className="review-summary">
				<div>
					<strong>{entries.length} files changed</strong>
					<span className="mono">
						<b className="addition">+{entries.reduce((total, entry) => total + entry.additions, 0)}</b>
						<b className="deletion">-{entries.reduce((total, entry) => total + entry.deletions, 0)}</b>
					</span>
				</div>
				<button className="quiet-button" type="button" onClick={() => void run(onOpenEditor)} disabled={busy}>
					<ExternalLink size={13} /> Open editor
				</button>
			</div>

			<div className="file-list" aria-label="Changed files">
				{entries.map(file => (
					<button
						className="file-row"
						data-selected={file.path === git.selectedPath}
						type="button"
						key={file.path}
						disabled={busy}
						onClick={() => void run(() => onSelectPath(file.path))}
					>
						<span className={`file-status file-status-${file.kind}`}>{changeStatus[file.kind]}</span>
						<span className="file-path mono">{file.path}</span>
						<span className="file-count mono">
							<b>+{file.additions}</b>
							{file.deletions > 0 && <i>-{file.deletions}</i>}
						</span>
					</button>
				))}
			</div>

			<section className="diff-card" aria-label="Selected file diff">
				<header>
					<span className="mono">{selected?.path ?? "Select a changed file"}</span>
					<button
						className="icon-button"
						type="button"
						onClick={() => void run(onRefresh)}
						disabled={busy}
						aria-label="Refresh Git changes"
					>
						<RefreshCw size={14} />
					</button>
				</header>
				<pre className="diff-raw mono">
					{git.diff ?? (selected && git.diffLoading ? "Loading diff…" : "Select a changed file")}
				</pre>
			</section>

			<div className="review-actions">
				{operationError && <span className="review-error">{operationError}</span>}
				<button
					className="quiet-button danger-button"
					type="button"
					disabled={busy || !selected}
					onClick={() => selected && setDiscardTarget(selected.path)}
				>
					<X size={14} />
					Discard {selected?.path ?? "selected"}…
				</button>
				<button className="primary-button" type="button" disabled={busy} onClick={() => void run(() => onStage())}>
					<Check size={14} /> Stage all
				</button>
			</div>
			{discardTarget && (
				<div className="dialog-backdrop" role="presentation">
					<section
						className="connection-dialog discard-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="discard-title"
					>
						<header>
							<div className="dialog-icon discard-icon" aria-hidden="true">
								<X size={18} />
							</div>
							<div>
								<h2 id="discard-title">Discard local changes?</h2>
								<p>This permanently restores the selected path to HEAD.</p>
							</div>
						</header>
						<div className="discard-dialog-body">
							<code className="mono">{discardTarget}</code>
							<footer>
								<button className="quiet-button" type="button" onClick={() => setDiscardTarget(undefined)}>
									Cancel
								</button>
								<button
									className="quiet-button danger-button"
									type="button"
									onClick={() => {
										const path = discardTarget;
										setDiscardTarget(undefined);
										void run(() => onDiscard([path]));
									}}
								>
									<X size={14} /> Confirm discard
								</button>
							</footer>
						</div>
					</section>
				</div>
			)}
		</div>
	);
}

function AgentsView({ task, agents }: { task: DesktopTask; agents: DesktopAgent[] }) {
	return (
		<div className="agents-view">
			<div className="agent-card agent-root">
				<div className="agent-icon">
					<Bot size={15} />
				</div>
				<div>
					<strong>{task.title}</strong>
					<span className="mono">
						{task.model} · {task.thinking} · {task.elapsed}
					</span>
				</div>
				<span className="status-dot status-running" />
			</div>
			{agents.length > 0 && <div className="agent-branch-line" />}
			{agents.map(agent => (
				<div className="agent-card agent-child" key={agent.id}>
					<div className="agent-icon">
						<GitBranch size={14} />
					</div>
					<div>
						<strong>{agent.label}</strong>
						<span>{agent.description ?? agent.status}</span>
					</div>
					{agent.status === "completed" ? (
						<Check size={14} className="agent-complete" />
					) : (
						<span className="activity-spinner" />
					)}
				</div>
			))}
			<p className="panel-hint">Live hierarchy, steering, and transcripts activate with the RPC subagent stream.</p>
		</div>
	);
}

export function Workbench({
	task,
	activeTab,
	onSelectTab,
	runtime,
	agents,
	git,
	onRefreshGit,
	onSelectGitPath,
	onStageGitChanges,
	onDiscardGitChanges,
	onOpenEditor,
	terminalAvailable,
	terminal,
	onStartTerminal,
	onWriteTerminal,
	onWriteTerminalBinary,
	onInterruptTerminal,
	onResizeTerminal,
	onStopTerminal,
}: WorkbenchProps) {
	const live = runtime.status === "connected";
	return (
		<aside className="workbench" aria-label="Task workbench">
			<div className="workbench-tabs" role="tablist" aria-label="Task details">
				{tabs.map(tab => (
					<button
						id={`workbench-tab-${tab.id}`}
						type="button"
						role="tab"
						aria-selected={activeTab === tab.id}
						aria-controls={`workbench-panel-${tab.id}`}
						data-selected={activeTab === tab.id}
						onClick={() => onSelectTab(tab.id)}
						key={tab.id}
					>
						<OmpIcon name={tab.id} />
						{tab.label}
						{tab.id === "changes" && git.snapshot && (
							<span className="tab-count">{git.snapshot.entries.length}</span>
						)}
						{tab.id === "agents" && task.agentCount > 0 && <span className="tab-count">{task.agentCount}</span>}
					</button>
				))}
			</div>
			<div
				className="workbench-panel"
				id="workbench-panel-changes"
				role="tabpanel"
				aria-labelledby="workbench-tab-changes"
				hidden={activeTab !== "changes"}
			>
				<ChangesView
					live={live}
					git={git}
					onRefresh={onRefreshGit}
					onSelectPath={onSelectGitPath}
					onStage={onStageGitChanges}
					onDiscard={onDiscardGitChanges}
					onOpenEditor={onOpenEditor}
				/>
			</div>
			<div
				className="workbench-panel"
				id="workbench-panel-terminal"
				role="tabpanel"
				aria-labelledby="workbench-tab-terminal"
				hidden={activeTab !== "terminal"}
			>
				<TerminalPanel
					key={task.id}
					available={terminalAvailable}
					terminal={terminal}
					cwd={task.cwd}
					onStart={onStartTerminal}
					onWrite={onWriteTerminal}
					onWriteBinary={onWriteTerminalBinary}
					onInterrupt={onInterruptTerminal}
					onResize={onResizeTerminal}
					onStop={onStopTerminal}
				/>
			</div>
			<div
				className="workbench-panel"
				id="workbench-panel-agents"
				role="tabpanel"
				aria-labelledby="workbench-tab-agents"
				hidden={activeTab !== "agents"}
			>
				<AgentsView task={task} agents={agents} />
			</div>
		</aside>
	);
}
