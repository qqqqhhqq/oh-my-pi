import {
	Archive,
	ArchiveRestore,
	Boxes,
	ChevronRight,
	FolderGit2,
	MoreHorizontal,
	PlugZap,
	Plus,
	Search,
	Settings,
	Star,
	Unplug,
} from "lucide-react";
import { useState } from "react";
import type { DesktopState, DesktopTask, DesktopTaskRuntime } from "../../state/desktop-state";
import type { DesktopProject } from "../../state/project-factory";
import { Brand } from "../primitives/Brand";
import { filterTasks } from "./task-filter";

interface TaskRailProps {
	state: DesktopState;
	projects: readonly DesktopProject[];
	runtime: DesktopTaskRuntime;
	rpcAvailable: boolean;
	onNewTask: () => void;
	onQuickNewSession: (projectId: string) => void;
	onSelectTask: (taskId: string) => void;
	onArchiveTask: (taskId: string, archived: boolean) => void;
	onToggleFavorite: (taskId: string, favorite: boolean) => void;
	onConnect: () => void;
	onDisconnect: () => void;
	onOpenSettings: () => void;
}

const runtimeLabel: Record<DesktopTaskRuntime["status"], string> = {
	preview: "Interface preview",
	disconnected: "OMP offline",
	connecting: "Connecting OMP",
	connected: "Local runtime",
	error: "Connection failed",
};

function taskProjects(projects: readonly DesktopProject[], tasks: readonly DesktopTask[]) {
	return projects
		.map(project => ({
			...project,
			tasks: tasks
				.filter(task => task.projectId === project.id)
				.toSorted((left, right) => {
					if (Boolean(left.favorite) !== Boolean(right.favorite)) {
						return left.favorite ? -1 : 1;
					}
					return right.lastOpenedAt - left.lastOpenedAt;
				}),
		}))
		.toSorted((left, right) => (right.tasks[0]?.lastOpenedAt ?? 0) - (left.tasks[0]?.lastOpenedAt ?? 0));
}

export function TaskRail({
	state,
	projects: storedProjects,
	runtime,
	rpcAvailable,
	onNewTask,
	onQuickNewSession,
	onSelectTask,
	onArchiveTask,
	onToggleFavorite,
	onConnect,
	onDisconnect,
	onOpenSettings,
}: TaskRailProps) {
	const [showArchived, setShowArchived] = useState(false);
	const [canopyOpen, setCanopyOpen] = useState(true);
	const [collapsedProjects, setCollapsedProjects] = useState<ReadonlySet<string>>(new Set());
	const [projectMenuFor, setProjectMenuFor] = useState<string | null>(null);
	const [copiedProjectPath, setCopiedProjectPath] = useState<string | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const visibleTasks = filterTasks(state.tasks, query, showArchived);
	const projects = taskProjects(storedProjects, visibleTasks).filter(
		project => !showArchived || project.tasks.length > 0,
	);

	function toggleProject(projectId: string) {
		setCollapsedProjects(current => {
			const next = new Set(current);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	}

	function toggleAllProjects() {
		if (canopyOpen) {
			setCanopyOpen(false);
			return;
		}
		setCanopyOpen(true);
		setCollapsedProjects(new Set());
	}

	async function copyProjectPath(project: DesktopProject) {
		if (!globalThis.navigator?.clipboard) return;
		try {
			await globalThis.navigator.clipboard.writeText(project.cwd);
			setCopiedProjectPath(project.id);
			globalThis.setTimeout(() => {
				setCopiedProjectPath(current => (current === project.id ? null : current));
			}, 1500);
		} catch {
			// Clipboard access is best-effort in preview windows.
		}
	}

	return (
		<aside className="task-rail" aria-label="Task navigation">
			<header className="rail-header">
				<Brand />
				<button
					className="icon-button"
					type="button"
					aria-label="Search tasks"
					aria-expanded={searchOpen}
					title="Search chats"
					onClick={() => setSearchOpen(value => !value)}
				>
					<Search size={16} />
				</button>
			</header>
			{searchOpen && (
				<div className="rail-search">
					<Search size={15} aria-hidden="true" />
					<input
						type="search"
						aria-label="Search tasks"
						placeholder="Search chats"
						value={query}
						autoFocus
						onChange={event => setQuery(event.target.value)}
						onKeyDown={event => {
							if (event.key === "Escape") {
								setQuery("");
								setSearchOpen(false);
							}
						}}
					/>
				</div>
			)}

			<section className="rail-operations" aria-label="Task operations">
				<div className="rail-actions">
					<button
						className="new-task-button"
						type="button"
						disabled={!rpcAvailable || storedProjects.length === 0 || runtime.status === "connecting"}
						title={rpcAvailable ? "Connect a task to OMP" : "Available in the desktop runtime"}
						onClick={onNewTask}
					>
						<Plus size={15} aria-hidden="true" />
						New chat
					</button>
				</div>
			</section>

			<nav className="project-tree" aria-label={showArchived ? "Archived projects" : "Projects"}>
				<button
					className="all-projects-heading"
					type="button"
					aria-expanded={canopyOpen}
					onClick={toggleAllProjects}
				>
					<ChevronRight className="project-chevron" size={13} aria-hidden="true" />
					<Boxes className="project-folder-icon" size={14} aria-hidden="true" />
					<strong>All projects</strong>
					<span className="project-count mono">{projects.length}</span>
				</button>

				<div className="projects-canopy" data-open={canopyOpen}>
					<div className="projects-canopy-inner">
						{projects.map(project => {
							const open = !collapsedProjects.has(project.id);
							const runningCount = project.tasks.filter(task => task.status === "running").length;
							return (
								<section className="project-node" data-open={open} key={project.id}>
									<div className="project-row">
										<button
											className="project-node-heading"
											type="button"
											aria-expanded={open}
											aria-controls={`project-sessions-${project.id}`}
											onClick={() => toggleProject(project.id)}
										>
											<ChevronRight className="project-chevron" size={13} aria-hidden="true" />
											<FolderGit2 className="project-folder-icon" size={14} aria-hidden="true" />
											<span className="project-node-copy">
												<strong>{project.title}</strong>
											</span>
											{runningCount > 0 && (
												<span className="project-running mono" title={`${runningCount} running sessions`}>
													{runningCount}
												</span>
											)}
											<span className="project-count mono">{project.tasks.length}</span>
										</button>
										<button
											className="node-action"
											type="button"
											aria-label={`Project menu for ${project.title}`}
											title="Project menu"
											aria-expanded={projectMenuFor === project.id}
											onClick={event => {
												event.stopPropagation();
												setProjectMenuFor(current => (current === project.id ? null : project.id));
											}}
										>
											<MoreHorizontal size={14} aria-hidden="true" />
										</button>
										<button
											className="node-action"
											type="button"
											aria-label={`New session in ${project.title}`}
											title="New session in this project"
											onClick={event => {
												event.stopPropagation();
												onQuickNewSession(project.id);
											}}
										>
											<Plus size={14} aria-hidden="true" />
										</button>
									</div>
									{projectMenuFor === project.id && (
										<div className="project-menu" role="menu" aria-label={`Menu for ${project.title}`}>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													void copyProjectPath(project);
													setProjectMenuFor(null);
												}}
											>
												{copiedProjectPath === project.id ? "Copied path" : "Copy project path"}
											</button>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													setProjectMenuFor(null);
													onQuickNewSession(project.id);
												}}
											>
												New session
											</button>
										</div>
									)}
									<div className="project-sessions" id={`project-sessions-${project.id}`} data-open={open}>
										<div className="project-sessions-inner">
											<ul className="task-tree" aria-label={`Sessions in ${project.title}`}>
												{project.tasks.map(task => {
													const selected = task.id === state.selectedTaskId;
													const favorite = Boolean(task.favorite);
													return (
														<li className="task-node" data-selected={selected} key={task.id}>
															<button
																className="task-node-select"
																type="button"
																aria-current={selected ? "page" : undefined}
																onClick={() => onSelectTask(task.id)}
															>
																<span
																	className={`status-dot status-${task.status}`}
																	aria-hidden="true"
																/>
																<span className="task-node-summary" title={task.title}>
																	{task.title}
																</span>
															</button>
															<div className="task-node-actions">
																<button
																	className="node-action"
																	type="button"
																	aria-label={task.archived ? "Restore chat" : "Archive chat"}
																	title={task.archived ? "Restore chat" : "Archive chat"}
																	onClick={() => onArchiveTask(task.id, !task.archived)}
																>
																	{task.archived ? (
																		<ArchiveRestore size={13} aria-hidden="true" />
																	) : (
																		<Archive size={13} aria-hidden="true" />
																	)}
																</button>
																<button
																	className="node-action"
																	type="button"
																	aria-label={favorite ? "Unfavorite chat" : "Favorite chat"}
																	title={favorite ? "Unfavorite chat" : "Favorite chat"}
																	data-active={favorite}
																	onClick={() => onToggleFavorite(task.id, !favorite)}
																>
																	<Star
																		size={13}
																		aria-hidden="true"
																		fill={favorite ? "currentColor" : "none"}
																	/>
																</button>
															</div>
														</li>
													);
												})}
											</ul>
										</div>
									</div>
								</section>
							);
						})}
					</div>
				</div>
			</nav>

			<footer className="rail-footer">
				<div className="rail-status-bar">
					<span className="connection-state" data-status={runtime.status} title={runtime.error}>
						<span
							className={`status-dot status-${runtime.status === "connected" ? "running" : runtime.status === "error" ? "failed" : "waiting"}`}
							aria-hidden="true"
						/>
						{runtimeLabel[runtime.status]}
					</span>
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
					) : null}
				</div>
				<div className="rail-footer-actions">
					<button
						className="icon-button"
						type="button"
						onClick={onOpenSettings}
						aria-label="Open settings"
						title="Settings"
					>
						<Settings size={15} aria-hidden="true" />
					</button>
					<button
						className="icon-button"
						type="button"
						onClick={() => setShowArchived(value => !value)}
						aria-label={showArchived ? "Show active tasks" : "Show archived tasks"}
						title={showArchived ? "Return to active tasks" : "View archived tasks"}
					>
						{showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
					</button>
				</div>
			</footer>
		</aside>
	);
}
