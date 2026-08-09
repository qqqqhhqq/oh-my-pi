import {
	Archive,
	ArchiveRestore,
	ChevronDown,
	FolderGit2,
	FolderPlus,
	MoreHorizontal,
	PlugZap,
	Plus,
	Search,
	Settings2,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import type { DesktopState, DesktopTask, DesktopTaskRuntime, TaskStatus } from "../../state/desktop-state";
import type { DesktopProject } from "../../state/project-factory";
import { Brand } from "../primitives/Brand";
import { filterTasks } from "./task-filter";

interface TaskRailProps {
	state: DesktopState;
	projects: readonly DesktopProject[];
	onSelectTask: (taskId: string) => void;
	runtime: DesktopTaskRuntime;
	rpcAvailable: boolean;
	onNewTask: () => void;
	onNewProject: () => void;
	onConnect: () => void;
	onDisconnect: () => void;
}

interface TaskGroupProps {
	id: string;
	label: string;
	statuses: TaskStatus[];
	tasks: DesktopTask[];
	selectedTaskId: string;
	onSelectTask: (taskId: string) => void;
}

const statusLabel: Record<TaskStatus, string> = {
	running: "Running",
	waiting: "Waiting",
	review: "Ready for review",
	completed: "Completed",
	failed: "Failed",
};

function TaskGroup({ id, label, statuses, tasks, selectedTaskId, onSelectTask }: TaskGroupProps) {
	const groupedTasks = tasks.filter(task => statuses.includes(task.status));
	if (groupedTasks.length === 0) return null;

	return (
		<section className="task-group" aria-labelledby={`task-group-${id}`}>
			<div className="task-group-heading">
				<h2 id={`task-group-${id}`}>{label}</h2>
				<span>{groupedTasks.length}</span>
			</div>
			<div className="task-list">
				{groupedTasks.map(task => {
					const selected = task.id === selectedTaskId;
					return (
						<button
							className="task-card"
							data-selected={selected}
							aria-current={selected ? "page" : undefined}
							onClick={() => onSelectTask(task.id)}
							type="button"
							key={task.id}
						>
							<span className={`status-dot status-${task.status}`} aria-hidden="true" />
							<span className="task-card-copy">
								<strong>{task.title}</strong>
								<span className="task-card-meta mono">{task.mode === "worktree" ? task.branch : task.cwd}</span>
								<span className="task-card-foot">
									<span>{statusLabel[task.status]}</span>
									<span className="mono">{task.elapsed}</span>
								</span>
							</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}

const runtimeLabel: Record<DesktopTaskRuntime["status"], string> = {
	preview: "Interface preview",
	disconnected: "OMP offline",
	connecting: "Connecting OMP",
	connected: "Local runtime",
	error: "Connection failed",
};

function projectGroups(projects: readonly DesktopProject[], tasks: readonly DesktopTask[]) {
	return projects
		.map(project => ({
			...project,
			tasks: tasks
				.filter(task => task.projectId === project.id)
				.toSorted((left, right) => right.lastOpenedAt - left.lastOpenedAt),
		}))
		.toSorted((left, right) => (right.tasks[0]?.lastOpenedAt ?? 0) - (left.tasks[0]?.lastOpenedAt ?? 0));
}

export function TaskRail({
	state,
	projects: storedProjects,
	onSelectTask,
	runtime,
	rpcAvailable,
	onNewTask,
	onNewProject,
	onConnect,
	onDisconnect,
}: TaskRailProps) {
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const visibleTasks = filterTasks(state.tasks, query, showArchived);
	const projects = projectGroups(storedProjects, visibleTasks).filter(
		project => !showArchived || project.tasks.length > 0,
	);
	const selectedWorkspace =
		storedProjects.find(
			project => project.id === state.tasks.find(task => task.id === state.selectedTaskId)?.projectId,
		)?.title ?? "OMP";

	return (
		<aside className="task-rail" aria-label="Task navigation">
			<header className="rail-header">
				<Brand />
				<button
					className="icon-button"
					type="button"
					disabled
					aria-label="Open settings"
					title="Settings arrive with persistence"
				>
					<Settings2 size={16} />
				</button>
			</header>

			<div className="workspace-switcher">
				<span className="workspace-avatar">OM</span>
				<span className="workspace-copy">
					<small>Workspace</small>
					<strong>{selectedWorkspace}</strong>
				</span>
				<ChevronDown size={14} aria-hidden="true" />
			</div>

			<div className="rail-actions">
				<button
					className="new-task-button"
					type="button"
					disabled={!rpcAvailable || storedProjects.length === 0 || runtime.status === "connecting"}
					title={rpcAvailable ? "Connect a task to OMP" : "Available in the desktop runtime"}
					onClick={onNewTask}
				>
					<Plus size={15} aria-hidden="true" />
					New session
				</button>
				<button
					className="icon-button"
					type="button"
					aria-label="Add local project"
					title="Add local project"
					onClick={onNewProject}
				>
					<FolderPlus size={15} />
				</button>
				<button
					className="icon-button"
					type="button"
					aria-label="Search tasks"
					aria-pressed={searchOpen}
					title="Search tasks"
					onClick={() => setSearchOpen(open => !open)}
				>
					<Search size={15} />
				</button>
			</div>
			{searchOpen && (
				<div className="task-search">
					<Search size={14} aria-hidden="true" />
					<input
						autoFocus
						aria-label="Filter tasks"
						placeholder="Title, branch, or path"
						value={query}
						onChange={event => setQuery(event.target.value)}
					/>
				</div>
			)}

			<nav className="task-groups" aria-label={showArchived ? "Archived projects" : "Projects"}>
				{projects.map(project => (
					<section className="task-group project-group" aria-label={`Project ${project.title}`} key={project.id}>
						<div className="task-group-heading">
							<h2>
								<FolderGit2 size={12} /> {project.title}
							</h2>
							<span>{project.tasks.length}</span>
						</div>
						<div className="project-path mono">{project.cwd}</div>
						<TaskGroup
							id={`project-${project.id}`}
							label="Sessions"
							statuses={["running", "waiting", "review", "failed", "completed"]}
							tasks={project.tasks}
							selectedTaskId={state.selectedTaskId}
							onSelectTask={onSelectTask}
						/>
						{project.tasks.length === 0 && <p className="project-empty">No sessions yet</p>}
					</section>
				))}
			</nav>

			<footer className="rail-footer">
				<span className="connection-state" data-status={runtime.status} title={runtime.error}>
					<span
						className={`status-dot status-${runtime.status === "connected" ? "running" : runtime.status === "error" ? "failed" : "waiting"}`}
						aria-hidden="true"
					/>
					{runtimeLabel[runtime.status]}
				</span>
				<div className="rail-footer-actions">
					<button
						className="icon-button"
						type="button"
						onClick={() => setShowArchived(value => !value)}
						aria-label={showArchived ? "Show active tasks" : "Show archived tasks"}
						title={showArchived ? "Return to active tasks" : "View archived tasks"}
					>
						{showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
					</button>
					{runtime.status === "connected" ? (
						<button
							className="icon-button"
							type="button"
							onClick={onDisconnect}
							aria-label="Disconnect OMP runtime"
						>
							<Unplug size={15} />
						</button>
					) : rpcAvailable ? (
						<button className="icon-button" type="button" onClick={onConnect} aria-label="Connect OMP runtime">
							<PlugZap size={15} />
						</button>
					) : (
						<button className="icon-button" type="button" disabled aria-label="More workspace actions">
							<MoreHorizontal size={16} />
						</button>
					)}
				</div>
			</footer>
		</aside>
	);
}
