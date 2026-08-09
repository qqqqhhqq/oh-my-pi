import { describe, expect, test } from "bun:test";
import type { DesktopTask } from "./desktop-state";
import type { DesktopProject } from "./project-factory";
import { loadTaskCatalog, type StorageLike, saveTaskCatalog, TASK_CATALOG_KEY } from "./task-catalog";

class MemoryStorage implements StorageLike {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

function task(overrides: Partial<DesktopTask> = {}): DesktopTask {
	return {
		id: "task-1",
		projectId: "project-1",
		workspaceId: "oh-my-pi",
		title: "Review Git changes",
		status: "running",
		mode: "direct",
		model: "gpt-5.2-codex",
		thinking: "high",
		cwd: "C:/workspace/oh-my-pi",
		branch: "codex/desktop-agent-ui",
		elapsed: "8m",
		contextPercent: 42,
		additions: 12,
		deletions: 4,
		agentCount: 2,
		archived: false,
		lastOpenedAt: 1_786_204_000_000,
		launchConfig: {
			cwd: "C:/workspace/oh-my-pi",
			executable: "omp",
			provider: "openai",
			model: "gpt-5.2-codex",
		},
		sessionPath: "C:/sessions/task-1.jsonl",
		...overrides,
	};
}

function project(overrides: Partial<DesktopProject> = {}): DesktopProject {
	return { id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi", ...overrides };
}

describe("desktop task catalog", () => {
	test("round-trips durable task fields without persisting runtime state", () => {
		const storage = new MemoryStorage();
		saveTaskCatalog(storage, [task()], [project()]);

		const raw = storage.values.get(TASK_CATALOG_KEY);
		expect(raw).toBeDefined();
		expect(raw).not.toContain('"status"');
		expect(raw).not.toContain('"elapsed"');
		expect(raw).not.toContain('"contextPercent"');

		const loaded = loadTaskCatalog(storage);
		expect(loaded.kind).toBe("loaded");
		if (loaded.kind !== "loaded") throw new Error("catalog should load");
		expect(loaded.tasks).toEqual([
			{
				id: "task-1",
				projectId: "project-1",
				workspaceId: "oh-my-pi",
				title: "Review Git changes",
				mode: "direct",
				model: "gpt-5.2-codex",
				thinking: "high",
				cwd: "C:/workspace/oh-my-pi",
				branch: "codex/desktop-agent-ui",
				archived: false,
				lastOpenedAt: 1_786_204_000_000,
				launchConfig: {
					cwd: "C:/workspace/oh-my-pi",
					executable: "omp",
					provider: "openai",
					model: "gpt-5.2-codex",
				},
				sessionPath: "C:/sessions/task-1.jsonl",
			},
		]);
		expect(loaded.projects).toEqual([project()]);
	});

	test("rejects corrupt catalog data without overwriting the original value", () => {
		const storage = new MemoryStorage();
		storage.values.set(TASK_CATALOG_KEY, '{"version":1,"tasks":[{"id":7}]}');

		const loaded = loadTaskCatalog(storage);

		expect(loaded.kind).toBe("invalid");
		expect(storage.values.get(TASK_CATALOG_KEY)).toBe('{"version":1,"tasks":[{"id":7}]}');
	});

	test("treats an unknown catalog version as invalid", () => {
		const storage = new MemoryStorage();
		storage.values.set(TASK_CATALOG_KEY, '{"version":2,"tasks":[]}');

		expect(loadTaskCatalog(storage).kind).toBe("invalid");
	});

	test("rejects duplicate task ids and mismatched launch workspaces", () => {
		const storage = new MemoryStorage();
		const first = task();
		const duplicate = task({ title: "Duplicate task" });
		saveTaskCatalog(storage, [first, duplicate], [project()]);

		expect(loadTaskCatalog(storage).kind).toBe("invalid");

		saveTaskCatalog(
			storage,
			[
				task({
					launchConfig: { cwd: "C:/workspace/a-different-repository", executable: "omp" },
				}),
			],
			[project()],
		);
		expect(loadTaskCatalog(storage).kind).toBe("invalid");
	});

	test("migrates a v1 task catalog into projects keyed by its local folder", () => {
		const storage = new MemoryStorage();
		storage.values.set(
			TASK_CATALOG_KEY,
			JSON.stringify({
				version: 1,
				tasks: [
					{
						...task(),
						projectId: undefined,
					},
				],
			}),
		);

		const loaded = loadTaskCatalog(storage);

		expect(loaded.kind).toBe("loaded");
		if (loaded.kind !== "loaded") throw new Error("catalog should migrate");
		expect(loaded.projects).toEqual([
			{ id: "legacy:C:/workspace/oh-my-pi", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" },
		]);
		expect(loaded.tasks[0]?.projectId).toBe("legacy:C:/workspace/oh-my-pi");
	});

	test("rejects duplicate task identities during v1 migration", () => {
		const storage = new MemoryStorage();
		storage.values.set(TASK_CATALOG_KEY, JSON.stringify({ version: 1, tasks: [task(), task()] }));

		expect(loadTaskCatalog(storage).kind).toBe("invalid");
	});
});
