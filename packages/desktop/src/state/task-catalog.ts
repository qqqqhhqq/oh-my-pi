import type { RpcLaunchConfig } from "../rpc/rpc-session";
import type { DesktopTask } from "./desktop-state";
import type { DesktopProject } from "./project-factory";

export const TASK_CATALOG_KEY = "omp.desktop.task-catalog";

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface PersistedDesktopTask {
	id: string;
	projectId: string;
	workspaceId: string;
	title: string;
	mode: DesktopTask["mode"];
	model: string;
	thinking: DesktopTask["thinking"];
	cwd: string;
	branch: string;
	archived: boolean;
	lastOpenedAt: number;
	launchConfig: RpcLaunchConfig;
	sessionPath?: string;
}

export interface PersistedDesktopProject extends DesktopProject {}

export type TaskCatalogLoadResult =
	| { kind: "empty"; tasks: []; projects: [] }
	| { kind: "loaded"; tasks: PersistedDesktopTask[]; projects: PersistedDesktopProject[] }
	| { kind: "invalid"; error: string; raw: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function launchConfig(value: unknown): RpcLaunchConfig | undefined {
	if (!isRecord(value) || typeof value.cwd !== "string") return undefined;
	if (
		!optionalString(value.executable) ||
		!optionalString(value.provider) ||
		!optionalString(value.model) ||
		!optionalString(value.sessionDir)
	) {
		return undefined;
	}
	return {
		cwd: value.cwd,
		executable: value.executable,
		provider: value.provider,
		model: value.model,
		sessionDir: value.sessionDir,
	};
}

function persistedTask(value: unknown, requireProjectId: boolean): PersistedDesktopTask | undefined {
	if (!isRecord(value)) return undefined;
	const config = launchConfig(value.launchConfig);
	if (
		!nonEmptyString(value.id) ||
		(requireProjectId && !nonEmptyString(value.projectId)) ||
		!nonEmptyString(value.workspaceId) ||
		!nonEmptyString(value.title) ||
		(value.mode !== "worktree" && value.mode !== "direct") ||
		!nonEmptyString(value.model) ||
		(value.thinking !== "off" &&
			value.thinking !== "minimal" &&
			value.thinking !== "low" &&
			value.thinking !== "medium" &&
			value.thinking !== "high" &&
			value.thinking !== "xhigh" &&
			value.thinking !== "max") ||
		!nonEmptyString(value.cwd) ||
		!nonEmptyString(value.branch) ||
		typeof value.archived !== "boolean" ||
		typeof value.lastOpenedAt !== "number" ||
		!Number.isFinite(value.lastOpenedAt) ||
		!config ||
		config.cwd !== value.cwd ||
		!optionalString(value.sessionPath)
	) {
		return undefined;
	}
	return {
		id: value.id,
		projectId: typeof value.projectId === "string" ? value.projectId : "",
		workspaceId: value.workspaceId,
		title: value.title,
		mode: value.mode,
		model: value.model,
		thinking: value.thinking,
		cwd: value.cwd,
		branch: value.branch,
		archived: value.archived,
		lastOpenedAt: value.lastOpenedAt,
		launchConfig: config,
		sessionPath: value.sessionPath,
	};
}

function persistedProject(value: unknown): PersistedDesktopProject | undefined {
	if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.title) || !nonEmptyString(value.cwd)) {
		return undefined;
	}
	return { id: value.id, title: value.title, cwd: value.cwd };
}

function legacyProjectId(cwd: string): string {
	return `legacy:${cwd}`;
}

function migrateLegacyTasks(tasks: Omit<PersistedDesktopTask, "projectId">[]): {
	tasks: PersistedDesktopTask[];
	projects: PersistedDesktopProject[];
} {
	const projects = new Map<string, PersistedDesktopProject>();
	const migratedTasks = tasks.map(task => {
		const projectId = legacyProjectId(task.cwd);
		if (!projects.has(projectId)) {
			projects.set(projectId, { id: projectId, title: task.workspaceId, cwd: task.cwd });
		}
		return { ...task, projectId };
	});
	return { tasks: migratedTasks, projects: [...projects.values()] };
}

function catalogValidationError(
	tasks: readonly PersistedDesktopTask[],
	projects: readonly PersistedDesktopProject[],
): string | undefined {
	if (new Set(tasks.map(task => task.id)).size !== tasks.length) {
		return "Desktop task catalog contains duplicate task ids";
	}
	if (new Set(projects.map(project => project.id)).size !== projects.length) {
		return "Desktop task catalog contains duplicate project ids";
	}
	const projectsById = new Map(projects.map(project => [project.id, project]));
	if (tasks.some(task => projectsById.get(task.projectId)?.cwd !== task.cwd)) {
		return "Desktop task catalog contains an invalid project session";
	}
	return undefined;
}

export function loadTaskCatalog(storage: StorageLike): TaskCatalogLoadResult {
	const raw = storage.getItem(TASK_CATALOG_KEY);
	if (raw === null) return { kind: "empty", tasks: [], projects: [] };

	try {
		const value: unknown = JSON.parse(raw);
		if (!isRecord(value) || !Array.isArray(value.tasks)) {
			return { kind: "invalid", error: "Unsupported desktop task catalog", raw };
		}
		if (value.version === 1) {
			const legacyTasks = value.tasks.map(task => persistedTask(task, false));
			if (legacyTasks.some(task => task === undefined)) {
				return { kind: "invalid", error: "Desktop task catalog contains an invalid task", raw };
			}
			const migrated = migrateLegacyTasks(legacyTasks as Omit<PersistedDesktopTask, "projectId">[]);
			const error = catalogValidationError(migrated.tasks, migrated.projects);
			return error ? { kind: "invalid", error, raw } : { kind: "loaded", ...migrated };
		}
		if (value.version !== 2 || !Array.isArray(value.projects)) {
			return { kind: "invalid", error: "Unsupported desktop task catalog", raw };
		}
		const tasks = value.tasks.map(task => persistedTask(task, true));
		const projects = value.projects.map(persistedProject);
		if (tasks.some(task => task === undefined) || projects.some(project => project === undefined)) {
			return { kind: "invalid", error: "Desktop task catalog contains an invalid task", raw };
		}
		const loadedTasks = tasks as PersistedDesktopTask[];
		const loadedProjects = projects as PersistedDesktopProject[];
		const error = catalogValidationError(loadedTasks, loadedProjects);
		if (error) return { kind: "invalid", error, raw };
		return { kind: "loaded", tasks: loadedTasks, projects: loadedProjects };
	} catch (error) {
		return {
			kind: "invalid",
			error: error instanceof Error ? error.message : String(error),
			raw,
		};
	}
}

export function saveTaskCatalog(
	storage: StorageLike,
	tasks: readonly DesktopTask[],
	projects: readonly DesktopProject[],
): void {
	const persisted: PersistedDesktopTask[] = tasks.map(task => ({
		id: task.id,
		projectId: task.projectId,
		workspaceId: task.workspaceId,
		title: task.title,
		mode: task.mode,
		model: task.model,
		thinking: task.thinking,
		cwd: task.cwd,
		branch: task.branch,
		archived: task.archived,
		lastOpenedAt: task.lastOpenedAt,
		launchConfig: task.launchConfig,
		sessionPath: task.sessionPath,
	}));
	storage.setItem(TASK_CATALOG_KEY, JSON.stringify({ version: 2, tasks: persisted, projects }));
}
