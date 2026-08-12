import { describe, expect, test } from "bun:test";
import { DesktopRpcSession, type RpcBridge, type RpcBridgeHandlers } from "./rpc-session";

const PROTOCOL_V2_READY = {
	type: "ready",
	supportedProtocolVersions: [1, 2],
	maxFrameBytes: 1024 * 1024,
	maxReassembledFrameBytes: 64 * 1024 * 1024,
};

class FakeBridge implements RpcBridge {
	handlers: RpcBridgeHandlers | undefined;
	frames: string[] = [];
	stopCount = 0;

	async subscribe(handlers: RpcBridgeHandlers) {
		this.handlers = handlers;
		return () => {
			this.handlers = undefined;
		};
	}

	async start() {}

	async send(_taskId: string, frame: string) {
		this.frames.push(frame);
	}

	async stop() {
		this.stopCount += 1;
	}

	emit(taskId: string, value: unknown) {
		this.handlers?.frame({ taskId, frame: JSON.stringify(value) });
	}

	emitExit(taskId: string, code: number | null) {
		this.handlers?.exit({ taskId, code });
	}
}

describe("DesktopRpcSession", () => {
	test("bootstraps session state and messages after the RPC ready frame", async () => {
		const bridge = new FakeBridge();
		const events: string[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => events.push(event.type));

		await session.connect({ cwd: "C:/workspace" });
		bridge.emit("task-1", { type: "ready", protocolVersion: 1 });
		await Promise.resolve();

		const commands = bridge.frames.map(frame => JSON.parse(frame) as { type: string });
		expect(events).toContain("connected");
		expect(commands.map(command => command.type)).toEqual([
			"get_state",
			"get_messages",
			"set_subagent_subscription",
			"get_subagents",
		]);
	});

	test("waits for protocol negotiation before reporting readiness", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});

		await session.connect({ cwd: "C:/workspace" });
		const ready = session.awaitReady();
		bridge.emit("task-1", PROTOCOL_V2_READY);
		await Promise.resolve();

		const negotiation = JSON.parse(bridge.frames[0] ?? "{}") as { id: string; type: string };
		expect(negotiation.type).toBe("negotiate_protocol");
		let resolved = false;
		void ready.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);

		bridge.emit("task-1", {
			id: negotiation.id,
			type: "response",
			command: "negotiate_protocol",
			success: true,
			data: { protocolVersion: 2 },
		});
		await ready;
		expect(resolved).toBe(true);
	});

	test("rejects readiness and closes a backend that never sends ready", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {}, 1);

		await session.connect({ cwd: "C:/workspace" });
		await expect(session.awaitReady()).rejects.toThrow("did not become ready");
		expect(bridge.stopCount).toBe(1);
	});

	test("rejects readiness if the backend exits before its ready frame", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});

		await session.connect({ cwd: "C:/workspace" });
		const ready = session.awaitReady();
		bridge.emitExit("task-1", 1);
		await expect(ready).rejects.toThrow("exited before it became ready");
	});

	test("restores a persisted session before bootstrapping desktop state", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});

		await session.connect({ cwd: "C:/workspace" }, "C:/sessions/saved.jsonl");
		bridge.emit("task-1", { type: "ready", protocolVersion: 1 });
		await Promise.resolve();

		const switchCommand = JSON.parse(bridge.frames[0] ?? "{}") as {
			id: string;
			type: string;
			sessionPath: string;
		};
		expect(switchCommand).toMatchObject({
			type: "switch_session",
			sessionPath: "C:/sessions/saved.jsonl",
		});
		expect(bridge.frames).toHaveLength(1);

		bridge.emit("task-1", {
			id: switchCommand.id,
			type: "response",
			command: "switch_session",
			success: true,
			data: { cancelled: false },
		});
		await Bun.sleep(0);

		const commands = bridge.frames.map(frame => JSON.parse(frame) as { type: string });
		expect(commands.map(command => command.type)).toEqual([
			"switch_session",
			"get_state",
			"get_messages",
			"set_subagent_subscription",
			"get_subagents",
		]);
	});

	test("negotiates protocol v2 and reassembles a response larger than one physical frame", async () => {
		const bridge = new FakeBridge();
		const messageSizes: number[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => {
			if (event.type === "messages") {
				const first = event.messages[0] as { content?: string } | undefined;
				messageSizes.push(first?.content?.length ?? 0);
			}
		});

		await session.connect({ cwd: "C:/workspace" });
		bridge.emit("task-1", PROTOCOL_V2_READY);
		await Promise.resolve();

		const negotiate = JSON.parse(bridge.frames[0] ?? "{}") as { id: string; type: string };
		expect(negotiate.type).toBe("negotiate_protocol");
		bridge.emit("task-1", {
			id: negotiate.id,
			type: "response",
			command: "negotiate_protocol",
			success: true,
			data: { protocolVersion: 2 },
		});
		await Bun.sleep(0);

		const messagesCommand = bridge.frames
			.map(frame => JSON.parse(frame) as { id: string; type: string })
			.find(command => command.type === "get_messages");
		expect(messagesCommand).toBeDefined();
		const content = "x".repeat(1024 * 1024 + 32);
		const logicalFrame = Buffer.from(
			JSON.stringify({
				id: messagesCommand?.id,
				type: "response",
				command: "get_messages",
				success: true,
				data: { messages: [{ content }] },
			}),
			"utf8",
		);
		const chunkSize = 256 * 1024;
		const count = Math.ceil(logicalFrame.byteLength / chunkSize);
		for (let index = 0; index < count; index++) {
			bridge.emit("task-1", {
				type: "rpc_chunk",
				chunkId: "rpc-large-response",
				index,
				count,
				byteLength: logicalFrame.byteLength,
				data: logicalFrame.subarray(index * chunkSize, (index + 1) * chunkSize).toString("base64"),
			});
		}
		await Bun.sleep(0);

		expect(messageSizes).toEqual([content.length]);
	});

	test("closes the session when a physical frame exceeds the negotiated transport limit", async () => {
		const bridge = new FakeBridge();
		const events: string[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => events.push(event.type));

		await session.connect({ cwd: "C:/workspace" });
		bridge.emit("task-1", { type: "notice", message: "x".repeat(1024 * 1024) });
		await Bun.sleep(0);

		expect(events).toEqual(["connecting", "error", "closed"]);
		expect(bridge.stopCount).toBe(1);
	});

	test("closes a failed persisted-session restore so the task can reconnect", async () => {
		const bridge = new FakeBridge();
		const events: string[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => events.push(event.type));

		await session.connect({ cwd: "C:/workspace" }, "C:/sessions/missing.jsonl");
		bridge.emit("task-1", { type: "ready", protocolVersion: 1 });
		await Promise.resolve();

		const switchCommand = JSON.parse(bridge.frames[0] ?? "{}") as { id: string };
		bridge.emit("task-1", {
			id: switchCommand.id,
			type: "response",
			command: "switch_session",
			success: false,
			error: "Session file does not exist",
		});
		await Bun.sleep(0);

		expect(events).toEqual(["connecting", "restore_failed", "error", "closed"]);
		expect(bridge.stopCount).toBe(1);
		expect(bridge.handlers).toBeUndefined();
	});

	test("publishes the current session file from get_state", async () => {
		const bridge = new FakeBridge();
		const sessionFiles: Array<string | undefined> = [];
		const session = new DesktopRpcSession("task-1", bridge, event => {
			if (event.type === "state") sessionFiles.push(event.state.sessionFile);
		});
		await session.connect({ cwd: "C:/workspace" });

		const refresh = session.refresh();
		const stateCommand = bridge.frames
			.map(frame => JSON.parse(frame) as { id: string; type: string })
			.find(command => command.type === "get_state");
		expect(stateCommand).toBeDefined();
		bridge.emit("task-1", {
			id: stateCommand?.id,
			type: "response",
			command: "get_state",
			success: true,
			data: {
				isStreaming: false,
				sessionId: "session-1",
				sessionFile: "C:/sessions/current.jsonl",
			},
		});
		for (const frame of bridge.frames) {
			const command = JSON.parse(frame) as { id: string; type: string };
			if (command.type === "get_messages") {
				bridge.emit("task-1", {
					id: command.id,
					type: "response",
					command: "get_messages",
					success: true,
					data: { messages: [] },
				});
			}
			if (command.type === "get_subagents") {
				bridge.emit("task-1", {
					id: command.id,
					type: "response",
					command: "get_subagents",
					success: true,
					data: { subagents: [] },
				});
			}
		}
		await refresh;

		expect(sessionFiles).toEqual(["C:/sessions/current.jsonl"]);
	});

	test("correlates command responses by id", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});
		await session.connect({ cwd: "C:/workspace" });

		const pending = session.prompt("Inspect the repository");
		const command = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string };
		bridge.emit("task-1", {
			id: command.id,
			type: "response",
			command: "prompt",
			success: true,
			data: { agentInvoked: true },
		});

		await expect(pending).resolves.toMatchObject({ success: true, command: "prompt" });
	});

	test("round-trips settings and provider-account commands through the RPC session", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});
		await session.connect({ cwd: "C:/workspace" });

		const settingsPromise = session.getSettings();
		const settingsCommand = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string };
		expect(settingsCommand.type).toBe("get_settings");
		bridge.emit("task-1", {
			id: settingsCommand.id,
			type: "response",
			command: "get_settings",
			success: true,
			data: {
				cwd: "C:/workspace",
				agentDir: "C:/Users/test/.omp",
				tabs: [{ id: "model", label: "Model" }],
				settings: [
					{
						path: "defaultThinkingLevel",
						type: "enum",
						tab: "model",
						label: "Thinking Level",
						description: "Reasoning depth",
						value: "high",
						defaultValue: "high",
					},
				],
			},
		});
		expect(await settingsPromise).toMatchObject({
			cwd: "C:/workspace",
			settings: [{ path: "defaultThinkingLevel" }],
		});

		const updatePromise = session.setSetting("defaultThinkingLevel", "medium");
		const updateCommand = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string; path: string };
		expect(updateCommand).toMatchObject({ type: "set_setting", path: "defaultThinkingLevel" });
		bridge.emit("task-1", {
			id: updateCommand.id,
			type: "response",
			command: "set_setting",
			success: true,
			data: {
				path: "defaultThinkingLevel",
				type: "enum",
				tab: "model",
				label: "Thinking Level",
				description: "Reasoning depth",
				value: "medium",
			},
		});
		expect(await updatePromise).toMatchObject({ path: "defaultThinkingLevel", value: "medium" });

		const providersPromise = session.getLoginProviders();
		const providersCommand = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string };
		expect(providersCommand.type).toBe("get_login_providers");
		bridge.emit("task-1", {
			id: providersCommand.id,
			type: "response",
			command: "get_login_providers",
			success: true,
			data: { providers: [{ id: "openai", name: "OpenAI", available: true, authenticated: false }] },
		});
		expect(await providersPromise).toEqual([{ id: "openai", name: "OpenAI", available: true, authenticated: false }]);
	});

	test("can steer a prompt while the agent is streaming", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});
		await session.connect({ cwd: "C:/workspace" });

		const pending = session.steer("Stop editing this file and inspect the failing test");
		const command = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string; message: string };
		expect(command).toMatchObject({
			type: "steer",
			message: "Stop editing this file and inspect the failing test",
		});
		bridge.emit("task-1", {
			id: command.id,
			type: "response",
			command: "steer",
			success: true,
		});

		await expect(pending).resolves.toMatchObject({ success: true, command: "steer" });
	});

	test("ignores frames emitted for another task", async () => {
		const bridge = new FakeBridge();
		const events: string[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => events.push(event.type));
		await session.connect({ cwd: "C:/workspace" });

		bridge.emit("task-2", { type: "ready", protocolVersion: 1 });
		await Promise.resolve();

		expect(events).toEqual(["connecting"]);
		expect(bridge.frames).toHaveLength(0);
	});

	test("releases bridge listeners when the child exits", async () => {
		const bridge = new FakeBridge();
		const session = new DesktopRpcSession("task-1", bridge, () => {});
		await session.connect({ cwd: "C:/workspace" });

		bridge.emitExit("task-1", 0);

		expect(bridge.handlers).toBeUndefined();
	});

	test("surfaces extension UI requests and sends direct responses", async () => {
		const bridge = new FakeBridge();
		const requests: string[] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => {
			if (event.type === "ui_request") requests.push(event.request.id);
		});
		await session.connect({ cwd: "C:/workspace" });

		bridge.emit("task-1", {
			type: "extension_ui_request",
			id: "approval-1",
			method: "confirm",
			title: "Run command?",
			message: "git status --short",
		});
		await session.respondToUi({ type: "extension_ui_response", id: "approval-1", confirmed: true });

		expect(requests).toEqual(["approval-1"]);
		expect(JSON.parse(bridge.frames.at(-1) ?? "{}")).toEqual({
			type: "extension_ui_response",
			id: "approval-1",
			confirmed: true,
		});
	});

	test("stages exact Git paths and publishes the returned snapshot", async () => {
		const bridge = new FakeBridge();
		const snapshots: string[][] = [];
		const session = new DesktopRpcSession("task-1", bridge, event => {
			if (event.type === "git_snapshot") snapshots.push(event.snapshot.entries.map(entry => entry.path));
		});
		await session.connect({ cwd: "C:/workspace" });

		const pending = session.stageGitChanges(["src/app.ts"]);
		const command = JSON.parse(bridge.frames.at(-1) ?? "{}") as { id: string; type: string; paths: string[] };
		expect(command).toMatchObject({ type: "stage_git_changes", paths: ["src/app.ts"] });
		bridge.emit("task-1", {
			id: command.id,
			type: "response",
			command: "stage_git_changes",
			success: true,
			data: {
				repoRoot: "C:/workspace",
				branch: "main",
				entries: [
					{
						path: "src/app.ts",
						indexStatus: "M",
						worktreeStatus: " ",
						kind: "modified",
						additions: 2,
						deletions: 1,
					},
				],
			},
		});

		await expect(pending).resolves.toMatchObject({ branch: "main" });
		expect(snapshots).toEqual([["src/app.ts"]]);
	});
});
