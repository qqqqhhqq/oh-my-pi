import type { ConversationEntry } from "../state/desktop-state";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(isRecord)
		.filter(block => (block.type === "text" || block.type === "output_text") && typeof block.text === "string")
		.map(block => block.text as string)
		.join("\n");
}

function toolCallIds(message: unknown): string[] {
	if (!isRecord(message) || !Array.isArray(message.content)) return [];
	return message.content
		.filter(isRecord)
		.filter(block => block.type === "toolCall" && typeof block.id === "string")
		.map(block => block.id as string);
}

function serialize(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (value === undefined) return undefined;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return undefined;
	}
}

function toolCallArguments(message: unknown, toolCallId: string): string | undefined {
	if (!isRecord(message) || !Array.isArray(message.content)) return undefined;
	const block = message.content.find(
		value =>
			isRecord(value) &&
			value.type === "toolCall" &&
			value.id === toolCallId &&
			("arguments" in value || "input" in value || "args" in value),
	);
	if (!isRecord(block)) return undefined;
	return serialize(block.arguments ?? block.input ?? block.args);
}

function messageEntry(message: unknown, index = 0, turnId?: string, toolArgs?: string): ConversationEntry | undefined {
	if (!isRecord(message) || typeof message.role !== "string") return undefined;
	const timestamp = typeof message.timestamp === "number" ? message.timestamp : index;

	switch (message.role) {
		case "user":
			return {
				id: `user-${timestamp}-${index}`,
				kind: "user",
				body: textContent(message.content),
				meta: "You",
			};
		case "assistant":
			return {
				id: `assistant-${timestamp}-${index}`,
				kind: "assistant",
				body: textContent(message.content),
				meta: typeof message.model === "string" ? `OMP · ${message.model}` : "OMP",
				status: "complete",
			};
		case "toolResult": {
			const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : `${timestamp}-${index}`;
			const failed = message.isError === true;
			const result = textContent(message.content) || serialize(message.content) || "";
			return {
				id: `tool-${toolCallId}`,
				kind: "tool",
				title: typeof message.toolName === "string" ? message.toolName : "tool",
				body: result,
				meta: failed ? "failed" : "completed",
				status: failed ? "failed" : "complete",
				turnId,
				toolCallId,
				toolArgs,
				toolResult: result,
			};
		}
		default:
			return undefined;
	}
}

function activeTurnId(entries: readonly ConversationEntry[]): string {
	return (
		entries.toReversed().find(entry => entry.kind === "turn")?.id ??
		entries.toReversed().find(entry => entry.kind === "tool")?.turnId ??
		"turn-untracked"
	);
}

function upsert(entries: ConversationEntry[], entry: ConversationEntry): ConversationEntry[] {
	const index = entries.findIndex(candidate => candidate.id === entry.id);
	if (index < 0) return [...entries, entry];
	const next = [...entries];
	next[index] = entry;
	return next;
}

function toolBody(value: unknown): string {
	if (typeof value === "string") return value;
	if (!isRecord(value)) return "";
	const content = textContent(value.content);
	if (content) return content;
	if (typeof value.command === "string") return value.command;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "";
	}
}

export function projectMessages(messages: readonly unknown[]): ConversationEntry[] {
	let userTurn = 0;
	let activeUserTurnId = "history-user-0";
	const toolTurns = new Map<string, string>();
	const toolArguments = new Map<string, string>();
	return messages.flatMap((message, index) => {
		if (isRecord(message) && message.role === "user") {
			userTurn += 1;
			activeUserTurnId = `history-user-${userTurn}`;
		}
		if (isRecord(message) && message.role === "assistant") {
			const turnId = `history-assistant-${typeof message.timestamp === "number" ? message.timestamp : index}-${index}`;
			for (const toolCallId of toolCallIds(message)) {
				toolTurns.set(toolCallId, turnId);
				const args = toolCallArguments(message, toolCallId);
				if (args) toolArguments.set(toolCallId, args);
			}
		}
		const toolCallId = isRecord(message) && typeof message.toolCallId === "string" ? message.toolCallId : undefined;
		const entry = messageEntry(
			message,
			index,
			toolCallId ? (toolTurns.get(toolCallId) ?? activeUserTurnId) : undefined,
			toolCallId ? toolArguments.get(toolCallId) : undefined,
		);
		return entry ? [entry] : [];
	});
}

export function projectAgentEvent(entries: ConversationEntry[], event: unknown): ConversationEntry[] {
	if (!isRecord(event) || typeof event.type !== "string") return entries;
	if (event.type === "turn_start") {
		const id =
			typeof event.id === "string" ? event.id : `turn-${entries.filter(entry => entry.kind === "turn").length + 1}`;
		return upsert(entries, { id, kind: "turn", body: "" });
	}

	if (event.type === "message_start" || event.type === "message_update" || event.type === "message_end") {
		const entry = messageEntry(event.message);
		if (!entry || entry.kind === "tool") return entries;
		return upsert(entries, {
			...entry,
			status: event.type === "message_end" ? "complete" : "running",
		});
	}

	if (
		(event.type === "tool_execution_start" ||
			event.type === "tool_execution_update" ||
			event.type === "tool_execution_end") &&
		typeof event.toolCallId === "string"
	) {
		const failed = event.type === "tool_execution_end" && event.isError === true;
		const source = event.type === "tool_execution_start" ? event.args : (event.partialResult ?? event.result);
		const previous = entries.find(entry => entry.id === `tool-${event.toolCallId}`);
		const toolResult = event.type === "tool_execution_end" ? toolBody(event.result) : previous?.toolResult;
		return upsert(entries, {
			...previous,
			id: `tool-${event.toolCallId}`,
			kind: "tool",
			title: typeof event.toolName === "string" ? event.toolName : "tool",
			body: toolBody(source) || previous?.body || (event.type === "tool_execution_start" ? "Starting…" : "Running…"),
			meta: failed ? "failed" : event.type === "tool_execution_end" ? "completed" : "running",
			status: failed ? "failed" : event.type === "tool_execution_end" ? "complete" : "running",
			turnId: previous?.turnId ?? activeTurnId(entries),
			toolCallId: event.toolCallId,
			toolArgs: previous?.toolArgs ?? serialize(event.args),
			toolResult: toolResult || undefined,
		});
	}

	return entries;
}
