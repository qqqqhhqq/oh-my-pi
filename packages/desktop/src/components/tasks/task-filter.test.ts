import { describe, expect, test } from "bun:test";
import type { DesktopTask } from "../../state/desktop-state";
import { filterTasks } from "./task-filter";

const tasks = [
	{
		id: "one",
		title: "Review Git changes",
		cwd: "C:/workspace/oh-my-pi",
		branch: "codex/desktop-agent-ui",
		archived: false,
	},
	{
		id: "two",
		title: "Index sessions",
		cwd: "C:/workspace/research-tools",
		branch: "main",
		archived: false,
	},
	{
		id: "three",
		title: "Old task",
		cwd: "C:/workspace/oh-my-pi",
		branch: "archive/old-task",
		archived: true,
	},
] as DesktopTask[];

describe("task search", () => {
	test("matches title, workspace path, and branch case-insensitively", () => {
		expect(filterTasks(tasks, "GIT").map(task => task.id)).toEqual(["one"]);
		expect(filterTasks(tasks, "research-tools").map(task => task.id)).toEqual(["two"]);
		expect(filterTasks(tasks, "DESKTOP-AGENT").map(task => task.id)).toEqual(["one"]);
	});

	test("excludes archived tasks from the active catalog", () => {
		expect(filterTasks(tasks, "old task")).toEqual([]);
		expect(filterTasks(tasks, "").map(task => task.id)).toEqual(["one", "two"]);
	});

	test("shows only archived tasks when the archived catalog is requested", () => {
		expect(filterTasks(tasks, "", true).map(task => task.id)).toEqual(["three"]);
	});
});
