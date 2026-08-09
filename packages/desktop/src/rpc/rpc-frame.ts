/** Maximum UTF-8 size of one newline-delimited RPC frame, including the newline. */
export const MAX_RPC_FRAME_BYTES = 1024 * 1024;
/** Maximum UTF-8 size of one logical protocol v2 frame after reassembly. */
export const MAX_RPC_REASSEMBLED_BYTES = 64 * 1024 * 1024;

const RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024;

interface PendingRpcChunks {
	chunkId: string;
	count: number;
	byteLength: number;
	nextIndex: number;
	chunks: Uint8Array[];
	receivedBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isRpcChunkFrame(value: unknown): value is Record<string, unknown> & { type: "rpc_chunk" } {
	return isRecord(value) && value.type === "rpc_chunk";
}

function decodeBase64(data: unknown): Uint8Array {
	if (
		typeof data !== "string" ||
		data.length === 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
	) {
		throw new Error("invalid rpc chunk data");
	}
	const binary = globalThis.atob(data);
	if (globalThis.btoa(binary) !== data) throw new Error("invalid rpc chunk data");
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function joinChunks(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
	const output = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

/** Strictly reassemble protocol v2 chunk frames after each JSONL line has been parsed. */
export class RpcFrameDecoder {
	#pending?: PendingRpcChunks;

	push(value: unknown): Record<string, unknown> | undefined {
		if (!isRpcChunkFrame(value)) {
			if (this.#pending) throw new Error("rpc chunk sequence interrupted");
			if (!isRecord(value)) throw new Error("rpc frame must be an object");
			return value;
		}

		const { chunkId, index, count, byteLength } = value;
		if (
			typeof chunkId !== "string" ||
			chunkId.length === 0 ||
			chunkId.length > 128 ||
			!Number.isSafeInteger(index) ||
			!Number.isSafeInteger(count) ||
			!Number.isSafeInteger(byteLength) ||
			typeof index !== "number" ||
			typeof count !== "number" ||
			typeof byteLength !== "number" ||
			index < 0 ||
			count < 2 ||
			count > Math.ceil(MAX_RPC_REASSEMBLED_BYTES / RPC_CHUNK_PAYLOAD_BYTES) ||
			index >= count ||
			byteLength < MAX_RPC_FRAME_BYTES ||
			byteLength > MAX_RPC_REASSEMBLED_BYTES
		) {
			throw new Error("invalid rpc chunk metadata");
		}

		const bytes = decodeBase64(value.data);
		if (bytes.byteLength > RPC_CHUNK_PAYLOAD_BYTES) {
			throw new Error("rpc chunk payload exceeds the transport limit");
		}

		if (!this.#pending) {
			if (index !== 0) throw new Error("rpc chunk sequence must start at index 0");
			this.#pending = { chunkId, count, byteLength, nextIndex: 0, chunks: [], receivedBytes: 0 };
		}
		const pending = this.#pending;
		if (
			pending.chunkId !== chunkId ||
			pending.count !== count ||
			pending.byteLength !== byteLength ||
			pending.nextIndex !== index
		) {
			throw new Error("rpc chunk sequence mismatch");
		}

		pending.chunks.push(bytes);
		pending.receivedBytes += bytes.byteLength;
		pending.nextIndex++;
		if (pending.receivedBytes > pending.byteLength) {
			throw new Error("rpc chunk sequence exceeds declared length");
		}
		if (pending.nextIndex < pending.count) return undefined;
		if (pending.receivedBytes !== pending.byteLength) {
			throw new Error("rpc chunk sequence length mismatch");
		}

		this.#pending = undefined;
		const json = new TextDecoder("utf-8", { fatal: true }).decode(joinChunks(pending.chunks, pending.byteLength));
		const frame: unknown = JSON.parse(json);
		if (!isRecord(frame)) throw new Error("rpc frame must be an object");
		return frame;
	}
}
