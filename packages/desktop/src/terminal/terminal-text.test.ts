import { describe, expect, test } from "bun:test";
import { TerminalTextDecoder } from "./terminal-text";

describe("TerminalTextDecoder", () => {
	test("preserves terminal control sequences for the emulator", () => {
		const decoder = new TerminalTextDecoder();
		const input = "\u001b[32mready\u001b[0m\r\n\u001b[6n";

		expect(decoder.push(new TextEncoder().encode(input))).toBe(input);
	});

	test("preserves UTF-8 characters split across PTY chunks", () => {
		const decoder = new TerminalTextDecoder();
		const bytes = new TextEncoder().encode("π ready");

		expect(decoder.push(bytes.slice(0, 1))).toBe("");
		expect(decoder.push(bytes.slice(1))).toBe("π ready");
	});
});
