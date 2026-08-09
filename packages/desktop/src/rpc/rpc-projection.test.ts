import { describe, expect, test } from "bun:test";
import { projectAgentEvent, projectMessages } from "./rpc-projection";

describe("RPC conversation projection", () => {
	test("projects persisted user, assistant, and tool-result messages", () => {
		const entries = projectMessages([
			{ role: "user", content: "Inspect the repository", timestamp: 100 },
			{
				role: "assistant",
				content: [{ type: "text", text: "I found the desktop package." }],
				model: "gpt-5.2-codex",
				timestamp: 200,
			},
			{
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "read",
				content: [{ type: "text", text: "packages/desktop/package.json" }],
				isError: false,
				timestamp: 300,
			},
		]);

		expect(entries.map(entry => entry.kind)).toEqual(["user", "assistant", "tool"]);
		expect(entries[1]?.body).toBe("I found the desktop package.");
		expect(entries[2]).toMatchObject({
			id: "tool-call-1",
			title: "read",
			body: "packages/desktop/package.json",
			status: "complete",
		});
	});

	test("replaces the same assistant entry as streaming updates arrive", () => {
		const first = projectAgentEvent([], {
			type: "message_start",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Inspecting" }],
				model: "gpt-5.2-codex",
				timestamp: 200,
			},
		});
		const updated = projectAgentEvent(first, {
			type: "message_update",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "Inspecting the repository" }],
				model: "gpt-5.2-codex",
				timestamp: 200,
			},
		});

		expect(updated).toHaveLength(1);
		expect(updated[0]?.body).toBe("Inspecting the repository");
	});

	test("tracks tool execution from running to completion", () => {
		const running = projectAgentEvent([], {
			type: "tool_execution_start",
			toolCallId: "call-2",
			toolName: "bash",
			args: { command: "git status --short" },
		});
		const complete = projectAgentEvent(running, {
			type: "tool_execution_end",
			toolCallId: "call-2",
			toolName: "bash",
			result: { content: [{ type: "text", text: "M package.json" }] },
			isError: false,
		});

		expect(running[0]).toMatchObject({ status: "running", body: "git status --short" });
		expect(complete).toHaveLength(1);
		expect(complete[0]).toMatchObject({ status: "complete", body: "M package.json" });
	});

	test("assigns sequential tool calls to the active agent turn", () => {
		const turn = projectAgentEvent([], { type: "turn_start", id: "turn-1" });
		const first = projectAgentEvent(turn, {
			type: "tool_execution_start",
			toolCallId: "call-1",
			toolName: "read",
			args: { path: "package.json" },
		});
		const second = projectAgentEvent(first, {
			type: "tool_execution_start",
			toolCallId: "call-2",
			toolName: "bash",
			args: { command: "git status" },
		});

		const tools = second.filter(entry => entry.kind === "tool");
		expect(tools).toHaveLength(2);
		expect(tools[0]?.turnId).toBe("turn-1");
		expect(tools[1]?.turnId).toBe("turn-1");
	});

	test("keeps restored tool results aligned with their assistant turns", () => {
		const entries = projectMessages([
			{ role: "user", content: "Inspect the repository", timestamp: 100 },
			{ role: "assistant", content: [{ type: "toolCall", id: "call-1" }], timestamp: 200 },
			{ role: "toolResult", toolCallId: "call-1", toolName: "read", content: "package.json", timestamp: 300 },
			{ role: "assistant", content: [{ type: "toolCall", id: "call-2" }], timestamp: 400 },
			{ role: "toolResult", toolCallId: "call-2", toolName: "bash", content: "M package.json", timestamp: 500 },
			{ role: "user", content: "Summarize it", timestamp: 600 },
			{ role: "toolResult", toolCallId: "call-3", toolName: "read", content: "summary.md", timestamp: 700 },
		]);

		const tools = entries.filter(entry => entry.kind === "tool");
		expect(tools.map(entry => entry.turnId)).toEqual([
			"history-assistant-200-1",
			"history-assistant-400-3",
			"history-user-2",
		]);
	});
});
