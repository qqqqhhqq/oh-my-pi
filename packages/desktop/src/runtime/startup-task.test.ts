import { describe, expect, test } from "bun:test";
import type { DesktopTask } from "../state/desktop-state";
import { selectStartupTask, shouldAutoStartBackend, shouldCreateDefaultSession } from "./startup-task";

function task(id: string, lastOpenedAt: number, archived = false): DesktopTask {
	return {
		id,
		projectId: id,
		workspaceId: id,
		title: id,
		status: "waiting",
		mode: "direct",
		model: "CLI default",
		thinking: "high",
		cwd: `C:/workspace/${id}`,
		branch: "main",
		elapsed: "—",
		contextPercent: 0,
		additions: 0,
		deletions: 0,
		agentCount: 0,
		archived,
		lastOpenedAt,
		launchConfig: { cwd: `C:/workspace/${id}` },
	};
}

describe("startup task selection", () => {
	test("does not start a backend while invalid catalog recovery is active", () => {
		expect(
			shouldAutoStartBackend({
				available: true,
				catalogError: "bad catalog",
				hasStarted: false,
			}),
		).toBe(false);
	});

	test("does not create an unsolicited session when local projects already exist", () => {
		expect(shouldCreateDefaultSession(true)).toBe(false);
	});

	test("continues to auto-connect an existing persisted session", () => {
		expect(shouldAutoStartBackend({ available: true, hasStarted: false })).toBe(true);
	});

	test("prefers the selected active task", () => {
		const selected = task("selected", 1);

		expect(selectStartupTask([task("recent", 2), selected], "selected")).toBe(selected);
	});

	test("falls back to the most recently opened active task", () => {
		const recent = task("recent", 3);

		expect(selectStartupTask([task("archived", 4, true), task("older", 2), recent], "archived")).toBe(recent);
	});
});
