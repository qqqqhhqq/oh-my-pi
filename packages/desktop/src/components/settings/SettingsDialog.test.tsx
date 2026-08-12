import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RpcSettingsSnapshot } from "../../rpc/rpc-session";
import { DEFAULT_DESKTOP_SETTINGS } from "../../state/desktop-settings";
import { SettingsDialog } from "./SettingsDialog";

const snapshot: RpcSettingsSnapshot = {
	cwd: "C:/workspace",
	agentDir: "C:/Users/test/.omp",
	tabs: [
		{ id: "appearance", label: "Appearance" },
		{ id: "model", label: "Model" },
	],
	settings: [
		{
			path: "defaultThinkingLevel",
			type: "enum",
			tab: "model",
			group: "Thinking",
			label: "Thinking Level",
			description: "Reasoning depth",
			value: "high",
			defaultValue: "high",
			options: [
				{ value: "auto", label: "Auto" },
				{ value: "high", label: "High" },
			],
		},
	],
};

describe("settings dialog", () => {
	test("renders the desktop settings entry point and backend categories", () => {
		const html = renderToStaticMarkup(
			<SettingsDialog
				open
				runtimeStatus="connected"
				desktopSettings={DEFAULT_DESKTOP_SETTINGS}
				snapshot={snapshot}
				loading={false}
				onClose={() => {}}
				onRefresh={() => {}}
				onDesktopSettingsChange={() => {}}
				onSetBackendSetting={async () => {}}
				onResetBackendSetting={async () => {}}
				onLogin={async () => {}}
			/>,
		);

		expect(html).toContain('role="dialog"');
		expect(html).toContain("Settings");
		expect(html).toContain("Appearance");
		expect(html).toContain("Model");
		expect(html).toContain("Default thinking level");
		expect(html).toContain("Default model");
	});
});
