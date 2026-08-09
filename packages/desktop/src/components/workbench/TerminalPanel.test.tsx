import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TerminalPanel } from "./TerminalPanel";

const handlers = {
	onStart: async () => {},
	onWrite: async () => {},
	onWriteBinary: async () => {},
	onInterrupt: async () => {},
	onResize: async () => {},
	onStop: async () => {},
};

describe("interactive terminal panel", () => {
	test("offers a desktop-only start boundary while offline", () => {
		const html = renderToStaticMarkup(
			<TerminalPanel
				available
				terminal={{ status: "offline", output: "", outputOffset: 0 }}
				cwd="C:/workspace"
				{...handlers}
			/>,
		);

		expect(html).toContain("Start terminal");
		expect(html).toContain("C:/workspace");
	});

	test("renders a real terminal emulator host and interactive controls while running", () => {
		const html = renderToStaticMarkup(
			<TerminalPanel
				available
				terminal={{ status: "running", output: "\u001b[32mπ ready\u001b[0m\r\n", outputOffset: 0 }}
				cwd="C:/workspace"
				{...handlers}
			/>,
		);

		expect(html).toContain('data-terminal-emulator="xterm"');
		expect(html).toContain('aria-label="Interactive terminal"');
		expect(html).toContain('aria-label="Interrupt terminal"');
		expect(html).toContain("Restart");
	});

	test("keeps the emulator mounted and disables restart while native output is draining", () => {
		const html = renderToStaticMarkup(
			<TerminalPanel
				available
				terminal={{ status: "stopping", output: "final output\n", outputOffset: 0, generation: 3 }}
				cwd="C:/workspace"
				{...handlers}
			/>,
		);

		expect(html).toContain('data-terminal-emulator="xterm"');
		expect(html).toContain("Stopping shell");
		expect(html).toContain("disabled");
	});
});
