import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";

describe("desktop application shell", () => {
	test("renders task navigation, the selected conversation, and workbench tabs", () => {
		const html = renderToStaticMarkup(<App />);

		expect(html).toContain("OMP Desktop");
		expect(html).toContain('data-theme="light"');
		expect(html).toContain('aria-label="Task navigation"');
		expect(html).toContain('aria-label="Open settings"');
		expect(html).toContain("Build the desktop task center");
		expect(html).toContain("Implementing the desktop shell");
		expect(html).toContain('role="tablist"');
		expect(html).toContain("Changes");
		expect(html).toContain("Terminal");
		expect(html).toContain("Agents");
	});

	test("keeps non-functional fixture controls explicitly disabled", () => {
		const html = renderToStaticMarkup(<App />);

		expect(html).toContain("Ask OMP to build, inspect, or fix…");
		expect(html).toContain("Connect RPC to send prompts");
		expect(html).toContain("disabled");
	});

	test("connects navigation and tab controls to stable accessible regions", () => {
		const html = renderToStaticMarkup(<App />);

		expect(html).toContain('aria-label="Projects"');
		expect(html).toContain("All projects");
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('aria-label="Project menu for desktop-agent-ui"');
		expect(html).toContain('aria-label="New session in desktop-agent-ui"');
		expect(html).toContain('aria-label="Archive chat"');
		expect(html).toContain('aria-label="Favorite chat"');
		expect(html).toContain('id="workbench-panel-changes"');
		expect(html).toContain('id="workbench-panel-terminal"');
		expect(html).toContain('id="workbench-panel-agents"');
	});

	test("exposes task search and management without enabling desktop-only creation in browser preview", () => {
		const html = renderToStaticMarkup(<App />);

		expect(html).toContain('aria-label="Manage selected task"');
		expect(html).toMatch(/<button[^>]*class="new-task-button"[^>]*disabled/);
	});
});
