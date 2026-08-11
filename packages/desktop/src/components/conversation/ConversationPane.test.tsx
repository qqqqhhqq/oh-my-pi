import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationPane, resolveComposerKeyAction } from "./ConversationPane";

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

	test("renders streaming, copy, completed tools, running tools, and error notices in the transcript", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[
					{
						id: "assistant-streaming",
						kind: "assistant",
						body: "Still inspecting the worktree",
						meta: "OMP",
						status: "running",
					},
					{
						id: "tool-complete",
						kind: "tool",
						title: "read",
						body: "README.md",
						meta: "completed",
						status: "complete",
						turnId: "turn-complete",
					},
					{
						id: "tool-running",
						kind: "tool",
						title: "bash",
						body: "git status --short",
						meta: "running",
						status: "running",
						turnId: "turn-running",
					},
					{
						id: "notice-error",
						kind: "notice",
						title: "OMP error",
						body: "Approval was denied",
						meta: "error",
						status: "failed",
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

		expect(html).toContain("Streaming reply");
		expect(html).toContain('aria-label="Copy message"');
		expect(html).toContain('aria-label="Copy tool output"');
		expect(html).toContain('data-turn-id="turn-complete"');
		expect(html).not.toContain('data-turn-id="turn-complete"><details open=""');
		expect(html).toContain('data-turn-id="turn-running"');
		expect(html).toContain('data-turn-id="turn-running"><details open=""');
		expect(html).toContain("OMP error");
		expect(html).toContain('data-status="failed"');
	});

	test("offers retry for a failed response using the latest user prompt", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={{ ...task, status: "failed" }}
				entries={[
					{ id: "user-1", kind: "user", body: "Run the test suite", meta: "You" },
					{
						id: "notice-error",
						kind: "notice",
						title: "OMP error",
						body: "The backend stopped.",
						status: "failed",
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

		expect(html).toContain('aria-label="Retry response"');
	});

	test("turns the send action into a steering action while OMP is working", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={{ ...task, status: "running" }}
				entries={[]}
				runtime={{ status: "connected", stderr: [] }}
				draft="Interrupt the current turn"
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onSteer={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toContain('aria-label="Steer OMP"');
		expect(html).toContain("Enter to steer");
	});

	test("maps composer keyboard shortcuts to submit, newline, and stop actions", () => {
		expect(resolveComposerKeyAction("Enter", false, false)).toBe("submit");
		expect(resolveComposerKeyAction("Enter", true, false)).toBe("newline");
		expect(resolveComposerKeyAction("Escape", false, true)).toBe("abort");
		expect(resolveComposerKeyAction("Escape", false, false)).toBe("none");
	});

	test("enables context attachment when the native picker is available", () => {
		const html = renderToStaticMarkup(
			<ConversationPane
				task={task}
				entries={[]}
				runtime={{ status: "connected", stderr: [] }}
				draft=""
				onDraftChange={() => {}}
				onPrompt={async () => {}}
				onAttachContext={async () => {}}
				onAbort={async () => {}}
				onRefresh={async () => {}}
				onManageTask={() => {}}
			/>,
		);

		expect(html).toMatch(/<button[^>]*aria-label="Attach context"[^>]*>/);
		expect(html).not.toContain('type="button" disabled="" aria-label="Attach context"');
	});
});
