import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopTask } from "./task-factory";

test("creates a durable desktop task from a Windows workspace", () => {
	const draft = {
		projectId: "project-1",
		title: "Desktop shell",
		cwd: "D:\\work\\oh-my-pi\\",
		executable: "omp",
		provider: "openai",
		model: "gpt-5.2-codex",
	};

	const task = createDesktopTask(draft, "task-1", 1234);

	assert.equal(task.workspaceId, "oh-my-pi");
	assert.equal(task.title, "Desktop shell");
	assert.equal(task.model, "gpt-5.2-codex");
	assert.equal(task.lastOpenedAt, 1234);
	assert.deepEqual(task.launchConfig, {
		cwd: "D:\\work\\oh-my-pi\\",
		executable: "omp",
		provider: "openai",
		model: "gpt-5.2-codex",
	});
});

test("derives a readable title from a POSIX workspace and omits blank launch options", () => {
	const task = createDesktopTask(
		{
			projectId: "project-2",
			title: "",
			cwd: "/work/oh-my-pi",
			executable: undefined,
			provider: undefined,
			model: undefined,
		},
		"task-2",
		5678,
	);

	assert.equal(task.workspaceId, "oh-my-pi");
	assert.equal(task.title, "Work in oh-my-pi");
	assert.equal(task.model, "CLI default");
	assert.equal(task.status, "waiting");
	assert.equal(task.mode, "direct");
	assert.deepEqual(task.launchConfig, { cwd: "/work/oh-my-pi" });
});
