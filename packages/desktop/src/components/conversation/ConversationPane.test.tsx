import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationPane } from "./ConversationPane";

const task = {
	id: "session-1",
	projectId: "project-1",
	workspaceId: "project-1",
	title: "Session",
	status: "waiting" as const,
	mode: "direct" as const,
	model: "OMP",
	thinking: "high" as const,
	cwd: "C:/project",
	branch: "main",
	elapsed: "—",
	contextPercent: 0,
	additions: 0,
	deletions: 0,
	agentCount: 0,
	archived: false,
	lastOpenedAt: 1,
	launchConfig: { cwd: "C:/project" },
};

describe("conversation rendering", () => {
	test("renders assistant replies as GitHub-flavored Markdown", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[{ id: "assistant", kind: "assistant", body: "## Result\n\n- **ready**", meta: "OMP" }]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toContain("<h2>Result</h2>");
		expect(html).toContain("<strong>ready</strong>");
	});

	test("opens safe Markdown links outside the current desktop WebView", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[{ id: "assistant", kind: "assistant", body: "[OMP](https://ohmy-pi.dev)", meta: "OMP" }]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	test("keeps completed tool output collapsed", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[
					{ id: "tool", kind: "tool", title: "bash", body: "git status", meta: "completed", status: "complete" },
				]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toContain("<details");
		expect(html).toContain("<summary");
	});

	test("groups one agent turn into one expandable execution flow", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[
					{ id: "turn-1", kind: "turn", body: "" },
					{
						id: "tool-1",
						kind: "tool",
						title: "read",
						body: "package.json",
						meta: "completed",
						status: "complete",
						turnId: "turn-1",
					},
					{
						id: "tool-2",
						kind: "tool",
						title: "bash",
						body: "git status",
						meta: "running",
						status: "running",
						turnId: "turn-1",
					},
				]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toContain('class="tool-turn"');
		expect(html.match(/class="tool-turn"/g)).toHaveLength(1);
		expect(html).toContain("read");
		expect(html).toContain("bash");
	});

	test("groups non-adjacent tools from the same agent turn", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[
					{
						id: "tool-1",
						kind: "tool",
						title: "read",
						body: "package.json",
						status: "complete",
						turnId: "turn-1",
					},
					{ id: "assistant-1", kind: "assistant", body: "Checking the workspace.", meta: "OMP" },
					{ id: "tool-2", kind: "tool", title: "bash", body: "git status", status: "running", turnId: "turn-1" },
				]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html.match(/class="tool-turn"/g)).toHaveLength(1);
		expect(html).toContain("2 steps");
	});
});
