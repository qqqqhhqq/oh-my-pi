import { MAX_RPC_FRAME_BYTES, MAX_RPC_REASSEMBLED_BYTES, RpcFrameDecoder } from "./rpc-frame";

export interface RpcLaunchConfig {
	cwd: string;
	executable?: string;
	provider?: string;
	model?: string;
	sessionDir?: string;
}

export type RpcCommand =
	| { type: "negotiate_protocol"; protocolVersion: 2 }
	| { type: "prompt"; message: string }
	| { type: "abort" }
	| { type: "bash"; command: string }
	| { type: "get_state" }
	| { type: "get_messages" }
	| { type: "switch_session"; sessionPath: string }
	| { type: "set_subagent_subscription"; level: "off" | "progress" | "events" }
	| { type: "get_subagents" }
	| { type: "get_git_snapshot" }
	| { type: "get_git_diff"; path: string }
	| { type: "stage_git_changes"; paths?: string[] }
	| { type: "discard_git_changes"; paths: string[] };

export type RpcGitChangeKind = "added" | "copied" | "deleted" | "modified" | "renamed" | "untracked" | "conflicted";

export interface RpcGitChange {
	path: string;
	originalPath?: string;
	indexStatus: string;
	worktreeStatus: string;
	kind: RpcGitChangeKind;
	additions: number;
	deletions: number;
}

export interface RpcGitSnapshot {
	repoRoot: string;
	branch: string;
	entries: RpcGitChange[];
}

export type RpcResponse =
	| { id?: string; type: "response"; command: string; success: true; data?: unknown }
	| { id?: string; type: "response"; command: string; success: false; error: string; code?: string };

export interface RpcSessionState {
	model?: { id: string };
	thinkingLevel?: string;
	isStreaming: boolean;
	sessionId: string;
	sessionFile?: string;
	contextUsage?: { percent: number };
}

export type RpcAgentEventType =
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_start"
	| "message_update"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_update"
	| "tool_execution_end";

export type RpcAgentEvent = { type: RpcAgentEventType } & Record<string, unknown>;

export type RpcExtensionUiRequest =
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[] }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string }
	| { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| { type: "extension_ui_request"; id: string; method: "cancel"; targetId: string }
	| { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setStatus";
			statusKey: string;
			statusText?: string;
	  }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines?: string[];
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "open_url";
			url: string;
			launchUrl?: string;
			instructions?: string;
	  };

export type RpcExtensionUiResponse =
	| { type: "extension_ui_response"; id: string; value: string }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

export type RpcInteractiveUiRequest = Extract<
	RpcExtensionUiRequest,
	{ method: "select" | "confirm" | "input" | "editor" }
>;
export type RpcUiEffect = Exclude<RpcExtensionUiRequest, RpcInteractiveUiRequest | { method: "cancel" }>;

export interface RpcFramePayload {
	taskId: string;
	frame: string;
}

export interface RpcStderrPayload {
	taskId: string;
	line: string;
}

export interface RpcExitPayload {
	taskId: string;
	code: number | null;
}

export interface RpcBridgeHandlers {
	frame: (payload: RpcFramePayload) => void;
	stderr: (payload: RpcStderrPayload) => void;
	exit: (payload: RpcExitPayload) => void;
}

export interface RpcBridge {
	subscribe(handlers: RpcBridgeHandlers): Promise<() => void>;
	start(taskId: string, config: RpcLaunchConfig): Promise<void>;
	send(taskId: string, frame: string): Promise<void>;
	stop(taskId: string): Promise<void>;
}

export type DesktopRpcEvent =
	| { type: "connecting" }
	| { type: "connected" }
	| { type: "closed" }
	| { type: "restore_failed"; message: string }
	| { type: "state"; state: RpcSessionState }
	| { type: "messages"; messages: unknown[] }
	| { type: "agent_event"; event: RpcAgentEvent }
	| { type: "subagents"; subagents: unknown[] }
	| { type: "ui_request"; request: RpcInteractiveUiRequest }
	| { type: "ui_cancel"; targetId: string }
	| { type: "ui_effect"; effect: RpcUiEffect }
	| { type: "git_snapshot"; snapshot: RpcGitSnapshot }
	| { type: "git_error"; message: string }
	| { type: "stderr"; line: string }
	| { type: "error"; message: string }
	| { type: "exited"; code: number | null };

type PendingRequest = {
	resolve: (response: RpcResponse) => void;
	reject: (error: Error) => void;
};

type ReadyGate = {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
};

type ReadyTimeout = Parameters<typeof globalThis.clearTimeout>[0];

const agentEventTypes = new Set<RpcAgentEventType>([
	"agent_start",
	"agent_end",
	"turn_start",
	"turn_end",
	"message_start",
	"message_update",
	"message_end",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
]);
const DEFAULT_READY_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function supportsRpcProtocolV2(value: Record<string, unknown>): boolean {
	return (
		value.type === "ready" &&
		Array.isArray(value.supportedProtocolVersions) &&
		value.supportedProtocolVersions.includes(2) &&
		value.maxFrameBytes === MAX_RPC_FRAME_BYTES &&
		value.maxReassembledFrameBytes === MAX_RPC_REASSEMBLED_BYTES
	);
}

function sessionState(value: unknown): RpcSessionState | undefined {
	if (!isRecord(value) || typeof value.isStreaming !== "boolean" || typeof value.sessionId !== "string") {
		return undefined;
	}
	const model = isRecord(value.model) && typeof value.model.id === "string" ? { id: value.model.id } : undefined;
	const contextUsage =
		isRecord(value.contextUsage) && typeof value.contextUsage.percent === "number"
			? { percent: value.contextUsage.percent }
			: undefined;
	return {
		model,
		thinkingLevel: typeof value.thinkingLevel === "string" ? value.thinkingLevel : undefined,
		isStreaming: value.isStreaming,
		sessionId: value.sessionId,
		sessionFile: typeof value.sessionFile === "string" ? value.sessionFile : undefined,
		contextUsage,
	};
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every(item => typeof item === "string") ? value : undefined;
}

const gitChangeKinds = new Set<RpcGitChangeKind>([
	"added",
	"copied",
	"deleted",
	"modified",
	"renamed",
	"untracked",
	"conflicted",
]);

function gitChange(value: unknown): RpcGitChange | undefined {
	if (
		!isRecord(value) ||
		typeof value.path !== "string" ||
		typeof value.indexStatus !== "string" ||
		typeof value.worktreeStatus !== "string" ||
		typeof value.kind !== "string" ||
		!gitChangeKinds.has(value.kind as RpcGitChangeKind) ||
		typeof value.additions !== "number" ||
		typeof value.deletions !== "number" ||
		(value.originalPath !== undefined && typeof value.originalPath !== "string")
	) {
		return undefined;
	}
	return {
		path: value.path,
		originalPath: value.originalPath,
		indexStatus: value.indexStatus,
		worktreeStatus: value.worktreeStatus,
		kind: value.kind as RpcGitChangeKind,
		additions: value.additions,
		deletions: value.deletions,
	};
}

function gitSnapshot(value: unknown): RpcGitSnapshot | undefined {
	if (
		!isRecord(value) ||
		typeof value.repoRoot !== "string" ||
		typeof value.branch !== "string" ||
		!Array.isArray(value.entries)
	) {
		return undefined;
	}
	const entries = value.entries.map(gitChange);
	if (entries.some(entry => entry === undefined)) return undefined;
	return { repoRoot: value.repoRoot, branch: value.branch, entries: entries as RpcGitChange[] };
}

function extensionUiRequest(value: Record<string, unknown>): RpcExtensionUiRequest | undefined {
	if (value.type !== "extension_ui_request" || typeof value.id !== "string" || typeof value.method !== "string") {
		return undefined;
	}
	const base = { type: "extension_ui_request" as const, id: value.id };
	switch (value.method) {
		case "select": {
			const options = stringArray(value.options);
			return typeof value.title === "string" && options
				? { ...base, method: "select", title: value.title, options }
				: undefined;
		}
		case "confirm":
			return typeof value.title === "string" && typeof value.message === "string"
				? { ...base, method: "confirm", title: value.title, message: value.message }
				: undefined;
		case "input":
			return typeof value.title === "string"
				? {
						...base,
						method: "input",
						title: value.title,
						placeholder: typeof value.placeholder === "string" ? value.placeholder : undefined,
					}
				: undefined;
		case "editor":
			return typeof value.title === "string"
				? {
						...base,
						method: "editor",
						title: value.title,
						prefill: typeof value.prefill === "string" ? value.prefill : undefined,
					}
				: undefined;
		case "cancel":
			return typeof value.targetId === "string"
				? { ...base, method: "cancel", targetId: value.targetId }
				: undefined;
		case "notify":
			return typeof value.message === "string"
				? {
						...base,
						method: "notify",
						message: value.message,
						notifyType: typeof value.notifyType === "string" ? value.notifyType : undefined,
					}
				: undefined;
		case "setStatus":
			return typeof value.statusKey === "string"
				? {
						...base,
						method: "setStatus",
						statusKey: value.statusKey,
						statusText: typeof value.statusText === "string" ? value.statusText : undefined,
					}
				: undefined;
		case "setWidget": {
			const widgetLines = value.widgetLines === undefined ? undefined : stringArray(value.widgetLines);
			return typeof value.widgetKey === "string" && (value.widgetLines === undefined || widgetLines)
				? { ...base, method: "setWidget", widgetKey: value.widgetKey, widgetLines }
				: undefined;
		}
		case "setTitle":
			return typeof value.title === "string" ? { ...base, method: "setTitle", title: value.title } : undefined;
		case "set_editor_text":
			return typeof value.text === "string" ? { ...base, method: "set_editor_text", text: value.text } : undefined;
		case "open_url":
			return typeof value.url === "string"
				? {
						...base,
						method: "open_url",
						url: value.url,
						launchUrl: typeof value.launchUrl === "string" ? value.launchUrl : undefined,
						instructions: typeof value.instructions === "string" ? value.instructions : undefined,
					}
				: undefined;
		default:
			return undefined;
	}
}

export class DesktopRpcSession {
	#frameDecoder = new RpcFrameDecoder();
	#pending = new Map<string, PendingRequest>();
	#protocolV2Enabled = false;
	#readyHandled = false;
	#ready: ReadyGate | undefined;
	#readySettled = false;
	#readyTimeout: ReadyTimeout | undefined;
	#requestId = 0;
	#sessionPathToRestore: string | undefined;
	#unsubscribe: (() => void) | undefined;

	constructor(
		readonly taskId: string,
		readonly bridge: RpcBridge,
		readonly onEvent: (event: DesktopRpcEvent) => void,
		readonly readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
	) {}

	async connect(config: RpcLaunchConfig, sessionPath?: string): Promise<void> {
		if (this.#unsubscribe) throw new Error(`RPC task ${this.taskId} is already connected`);

		this.#frameDecoder = new RpcFrameDecoder();
		this.#protocolV2Enabled = false;
		this.#readyHandled = false;
		this.#ready = this.#createReadyGate();
		this.#readySettled = false;
		this.#sessionPathToRestore = sessionPath;
		this.onEvent({ type: "connecting" });
		this.#unsubscribe = await this.bridge.subscribe({
			frame: payload => this.#handleFrame(payload),
			stderr: payload => {
				if (payload.taskId === this.taskId) this.onEvent({ type: "stderr", line: payload.line });
			},
			exit: payload => {
				if (payload.taskId !== this.taskId) return;
				this.#unsubscribe?.();
				this.#unsubscribe = undefined;
				this.#rejectPending(
					new Error(`OMP RPC process exited${payload.code === null ? "" : ` (${payload.code})`}`),
				);
				this.#rejectReady(new Error("OMP RPC process exited before it became ready"));
				this.onEvent({ type: "exited", code: payload.code });
			},
		});

		try {
			await this.bridge.start(this.taskId, config);
			this.#armReadyTimeout();
		} catch (error) {
			this.#unsubscribe();
			this.#unsubscribe = undefined;
			this.#rejectReady(error instanceof Error ? error : new Error(String(error)));
			this.onEvent({ type: "error", message: errorMessage(error) });
			throw error;
		}
	}

	async awaitReady(): Promise<void> {
		if (!this.#ready) throw new Error(`RPC task ${this.taskId} has not started`);
		await this.#ready.promise;
	}

	async prompt(message: string): Promise<RpcResponse> {
		return this.command({ type: "prompt", message });
	}

	async abort(): Promise<RpcResponse> {
		return this.command({ type: "abort" });
	}

	async bash(command: string): Promise<RpcResponse> {
		return this.command({ type: "bash", command });
	}

	async respondToUi(response: RpcExtensionUiResponse): Promise<void> {
		await this.bridge.send(this.taskId, JSON.stringify(response));
	}

	async refresh(): Promise<void> {
		await Promise.all([this.#loadState(), this.#loadMessages(), this.#loadSubagents()]);
	}

	async refreshGit(): Promise<RpcGitSnapshot | undefined> {
		try {
			const response = await this.command({ type: "get_git_snapshot" });
			return this.#publishGitSnapshot(response, "get_git_snapshot");
		} catch (error) {
			this.onEvent({ type: "git_error", message: errorMessage(error) });
			return undefined;
		}
	}

	async getGitDiff(path: string): Promise<string> {
		const response = await this.command({ type: "get_git_diff", path });
		if (!response.success) throw new Error(response.error);
		if (response.command !== "get_git_diff" || !isRecord(response.data) || typeof response.data.diff !== "string") {
			throw new Error("OMP returned an invalid Git diff");
		}
		return response.data.diff;
	}

	async stageGitChanges(paths: string[] = []): Promise<RpcGitSnapshot> {
		const response = await this.command({ type: "stage_git_changes", paths });
		return this.#publishGitSnapshot(response, "stage_git_changes");
	}

	async discardGitChanges(paths: string[]): Promise<RpcGitSnapshot> {
		const response = await this.command({ type: "discard_git_changes", paths });
		return this.#publishGitSnapshot(response, "discard_git_changes");
	}

	async command(command: RpcCommand): Promise<RpcResponse> {
		const id = `desktop-${++this.#requestId}`;
		const { promise, resolve, reject } = Promise.withResolvers<RpcResponse>();
		this.#pending.set(id, { resolve, reject });

		try {
			await this.bridge.send(this.taskId, JSON.stringify({ ...command, id }));
		} catch (error) {
			this.#pending.delete(id);
			reject(error instanceof Error ? error : new Error(String(error)));
		}

		return promise;
	}

	async stop(): Promise<void> {
		const unsubscribe = this.#unsubscribe;
		this.#unsubscribe = undefined;
		unsubscribe?.();
		try {
			await this.bridge.stop(this.taskId);
		} finally {
			this.#rejectPending(new Error("OMP RPC session stopped"));
			this.#rejectReady(new Error("OMP RPC session stopped before it became ready"));
		}
	}

	#handleFrame(payload: RpcFramePayload): void {
		if (payload.taskId !== this.taskId) return;
		if (new TextEncoder().encode(payload.frame).byteLength + 1 > MAX_RPC_FRAME_BYTES) {
			void this.#failAndClose("OMP emitted an RPC frame larger than the transport limit");
			return;
		}

		let rawFrame: unknown;
		try {
			rawFrame = JSON.parse(payload.frame);
		} catch {
			void this.#failAndClose("OMP emitted an invalid JSONL frame");
			return;
		}

		if (isRecord(rawFrame) && rawFrame.type === "rpc_chunk" && !this.#protocolV2Enabled) {
			void this.#failAndClose("OMP emitted an RPC chunk before protocol negotiation");
			return;
		}

		let frame: Record<string, unknown> | undefined;
		try {
			frame = this.#frameDecoder.push(rawFrame);
		} catch (error) {
			void this.#failAndClose(`OMP emitted an invalid RPC frame: ${errorMessage(error)}`);
			return;
		}
		if (!frame || typeof frame.type !== "string") return;
		if (frame.type === "ready") {
			if (this.#readyHandled) {
				void this.#failAndClose("OMP emitted more than one ready frame");
				return;
			}
			this.#readyHandled = true;
			void this.#negotiateRestoreAndBootstrap(frame);
			return;
		}
		if (frame.type === "response") {
			const id = frame.id;
			if (typeof id !== "string") return;
			const pending = this.#pending.get(id);
			if (!pending) return;
			this.#pending.delete(id);
			pending.resolve(frame as RpcResponse);
			return;
		}
		if (frame.type === "extension_ui_request") {
			const request = extensionUiRequest(frame);
			if (!request) {
				void this.#failAndClose("OMP emitted an invalid extension UI request");
				return;
			}
			if (request.method === "cancel") {
				this.onEvent({ type: "ui_cancel", targetId: request.targetId });
			} else if (
				request.method === "select" ||
				request.method === "confirm" ||
				request.method === "input" ||
				request.method === "editor"
			) {
				this.onEvent({ type: "ui_request", request });
			} else {
				this.onEvent({ type: "ui_effect", effect: request });
			}
			return;
		}
		if (agentEventTypes.has(frame.type as RpcAgentEventType)) {
			this.onEvent({ type: "agent_event", event: frame as RpcAgentEvent });
		}
	}

	async #negotiateRestoreAndBootstrap(ready: Record<string, unknown>): Promise<void> {
		try {
			if (supportsRpcProtocolV2(ready)) {
				this.#protocolV2Enabled = true;
				const negotiation = await this.command({ type: "negotiate_protocol", protocolVersion: 2 });
				if (
					!negotiation.success ||
					negotiation.command !== "negotiate_protocol" ||
					!isRecord(negotiation.data) ||
					negotiation.data.protocolVersion !== 2
				) {
					throw new Error("OMP RPC protocol v2 negotiation failed");
				}
			}
			if (this.#sessionPathToRestore) {
				try {
					const response = await this.command({
						type: "switch_session",
						sessionPath: this.#sessionPathToRestore,
					});
					if (!response.success) throw new Error(response.error);
					if (
						response.command !== "switch_session" ||
						!isRecord(response.data) ||
						typeof response.data.cancelled !== "boolean"
					) {
						throw new Error("OMP returned an invalid switch_session response");
					}
					if (response.data.cancelled) throw new Error("OMP cancelled the persisted session restore");
				} catch (error) {
					this.onEvent({ type: "restore_failed", message: errorMessage(error) });
					throw error;
				}
			}
			this.onEvent({ type: "connected" });
			this.#resolveReady();
			await Promise.all([
				this.#loadState(),
				this.#loadMessages(),
				this.command({ type: "set_subagent_subscription", level: "progress" }),
				this.#loadSubagents(),
			]);
		} catch (error) {
			await this.#failAndClose(errorMessage(error));
		}
	}

	async #failAndClose(message: string): Promise<void> {
		this.#rejectReady(new Error(message));
		this.onEvent({ type: "error", message });
		try {
			await this.stop();
		} finally {
			this.onEvent({ type: "closed" });
		}
	}

	async #loadState(): Promise<void> {
		const response = await this.command({ type: "get_state" });
		if (response.success && response.command === "get_state") {
			const state = sessionState(response.data);
			if (!state) throw new Error("OMP returned an invalid session state");
			this.onEvent({ type: "state", state });
		} else if (!response.success) {
			throw new Error(response.error);
		}
	}

	async #loadMessages(): Promise<void> {
		const response = await this.command({ type: "get_messages" });
		if (response.success && response.command === "get_messages") {
			if (!isRecord(response.data) || !Array.isArray(response.data.messages)) {
				throw new Error("OMP returned an invalid message list");
			}
			this.onEvent({ type: "messages", messages: response.data.messages });
		} else if (!response.success) {
			throw new Error(response.error);
		}
	}

	async #loadSubagents(): Promise<void> {
		const response = await this.command({ type: "get_subagents" });
		if (response.success && response.command === "get_subagents") {
			if (!isRecord(response.data) || !Array.isArray(response.data.subagents)) {
				throw new Error("OMP returned an invalid subagent list");
			}
			this.onEvent({ type: "subagents", subagents: response.data.subagents });
		} else if (!response.success) {
			throw new Error(response.error);
		}
	}

	#publishGitSnapshot(response: RpcResponse, command: string): RpcGitSnapshot {
		if (!response.success) throw new Error(response.error);
		if (response.command !== command) throw new Error(`OMP returned a mismatched ${command} response`);
		const snapshot = gitSnapshot(response.data);
		if (!snapshot) throw new Error("OMP returned an invalid Git snapshot");
		this.onEvent({ type: "git_snapshot", snapshot });
		return snapshot;
	}

	#rejectPending(error: Error): void {
		for (const pending of this.#pending.values()) pending.reject(error);
		this.#pending.clear();
	}

	#createReadyGate(): ReadyGate {
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		void promise.catch(() => {});
		return { promise, resolve, reject };
	}

	#armReadyTimeout(): void {
		if (this.#readySettled || this.readyTimeoutMs <= 0) return;
		this.#clearReadyTimeout();
		this.#readyTimeout = globalThis.setTimeout(() => {
			void this.#failAndClose(`OMP RPC did not become ready within ${this.readyTimeoutMs}ms`);
		}, this.readyTimeoutMs);
	}

	#clearReadyTimeout(): void {
		if (this.#readyTimeout === undefined) return;
		globalThis.clearTimeout(this.#readyTimeout);
		this.#readyTimeout = undefined;
	}

	#resolveReady(): void {
		if (this.#readySettled) return;
		this.#readySettled = true;
		this.#clearReadyTimeout();
		this.#ready?.resolve();
	}

	#rejectReady(error: Error): void {
		if (this.#readySettled) return;
		this.#readySettled = true;
		this.#clearReadyTimeout();
		this.#ready?.reject(error);
	}
}
