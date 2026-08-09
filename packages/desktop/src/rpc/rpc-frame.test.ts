import { describe, expect, test } from "bun:test";
import { MAX_RPC_REASSEMBLED_BYTES, RpcFrameDecoder } from "./rpc-frame";

describe("RpcFrameDecoder", () => {
	test("reassembles ordered UTF-8 protocol v2 chunks", () => {
		const decoder = new RpcFrameDecoder();
		const message = `${"x".repeat(1024 * 1024)}你好 OMP`;
		const json = JSON.stringify({ type: "response", data: { message } });
		const bytes = Buffer.from(json, "utf8");
		const chunkSize = 256 * 1024;
		const count = Math.ceil(bytes.byteLength / chunkSize);
		let result: Record<string, unknown> | undefined;
		for (let index = 0; index < count; index++) {
			result = decoder.push({
				type: "rpc_chunk",
				chunkId: "rpc-1",
				index,
				count,
				byteLength: bytes.byteLength,
				data: bytes.subarray(index * chunkSize, (index + 1) * chunkSize).toString("base64"),
			});
			if (index < count - 1) expect(result).toBeUndefined();
		}
		const data = result?.data as { message?: string } | undefined;
		expect(data?.message).toBe(message);
	});

	test("rejects oversized or interrupted chunk sequences", () => {
		const oversized = new RpcFrameDecoder();
		expect(() =>
			oversized.push({
				type: "rpc_chunk",
				chunkId: "rpc-large",
				index: 0,
				count: 2,
				byteLength: MAX_RPC_REASSEMBLED_BYTES + 1,
				data: "YQ==",
			}),
		).toThrow("invalid rpc chunk metadata");

		const interrupted = new RpcFrameDecoder();
		interrupted.push({
			type: "rpc_chunk",
			chunkId: "rpc-2",
			index: 0,
			count: 2,
			byteLength: 1024 * 1024,
			data: "YQ==",
		});
		expect(() => interrupted.push({ type: "response" })).toThrow("rpc chunk sequence interrupted");
	});
});
