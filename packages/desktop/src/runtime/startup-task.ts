import type { DesktopTask } from "../state/desktop-state";

interface BackendStartupState {
	available: boolean;
	catalogError?: string;
	hasStarted: boolean;
}

export function shouldAutoStartBackend({ available, catalogError, hasStarted }: BackendStartupState): boolean {
	return available && !catalogError && !hasStarted;
}

export function shouldCreateDefaultSession(hasProjects: boolean): boolean {
	return !hasProjects;
}

export function selectStartupTask(tasks: readonly DesktopTask[], selectedTaskId: string): DesktopTask | undefined {
	const selected = tasks.find(task => task.id === selectedTaskId && !task.archived);
	if (selected) return selected;
	return tasks.filter(task => !task.archived).toSorted((left, right) => right.lastOpenedAt - left.lastOpenedAt)[0];
}
