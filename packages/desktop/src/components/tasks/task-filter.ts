import type { DesktopTask } from "../../state/desktop-state";

export function filterTasks(tasks: readonly DesktopTask[], query: string, archived = false): DesktopTask[] {
	const normalized = query.trim().toLocaleLowerCase();
	return tasks.filter(task => {
		if (task.archived !== archived) return false;
		if (!normalized) return true;
		return [task.title, task.cwd, task.branch].some(value => value.toLocaleLowerCase().includes(normalized));
	});
}
