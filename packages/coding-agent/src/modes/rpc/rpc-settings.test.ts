import { describe, expect, test } from "bun:test";
import { Settings } from "../../config/settings";
import { getRpcSettingsSnapshot, type RpcSettingsSnapshot, setRpcSetting } from "./rpc-settings";

function setting(snapshot: RpcSettingsSnapshot, path: string) {
	return snapshot.settings.find(item => item.path === path);
}

describe("RPC settings bridge", () => {
	test("exposes backend tabs, current values, and safe metadata", () => {
		const settings = Settings.isolated({
			defaultThinkingLevel: "medium",
			"tools.approvalMode": "write",
		});

		const snapshot = getRpcSettingsSnapshot(settings);

		expect(snapshot.tabs.map(tab => tab.id)).toContain("appearance");
		expect(snapshot.tabs.map(tab => tab.id)).toContain("providers");
		expect(setting(snapshot, "defaultThinkingLevel")).toMatchObject({
			path: "defaultThinkingLevel",
			type: "enum",
			value: "medium",
		});
		expect(setting(snapshot, "tools.approvalMode")).toMatchObject({
			path: "tools.approvalMode",
			value: "write",
		});
		expect(snapshot).toHaveProperty("agentDir");
		expect(snapshot).toHaveProperty("cwd");
	});

	test("writes supported settings and rejects invalid values", () => {
		const settings = Settings.isolated();

		const updated = setRpcSetting(settings, "defaultThinkingLevel", "medium");

		expect(updated).toMatchObject({ path: "defaultThinkingLevel", value: "medium" });
		expect(String(settings.get("defaultThinkingLevel"))).toBe("medium");
		expect(() => setRpcSetting(settings, "defaultThinkingLevel", "invalid")).toThrow();
		expect(() => setRpcSetting(settings, "unknown.setting", true)).toThrow("Unknown setting");
	});
});
