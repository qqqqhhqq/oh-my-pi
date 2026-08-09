import { describe, expect, test } from "bun:test";
import { appendTerminalOutput, terminalOutputDelta } from "./terminal-output";

describe("terminal output window", () => {
	test("advances an absolute offset when the retained output window slides", () => {
		const current = { output: "a".repeat(200_000), outputOffset: 0 };
		const next = appendTerminalOutput(current, "BC");

		expect(next.output).toHaveLength(200_000);
		expect(next.outputOffset).toBe(2);
		expect(next.output.endsWith("BC")).toBe(true);
	});

	test("returns only unseen bytes when truncation slides an active emulator window", () => {
		const previous = { output: "a".repeat(200_000), outputOffset: 0 };
		const current = appendTerminalOutput(previous, "BC");

		expect(terminalOutputDelta(previous, current)).toEqual({ reset: false, data: "BC" });
	});
});
