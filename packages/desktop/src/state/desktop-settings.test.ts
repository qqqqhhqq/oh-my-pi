import { describe, expect, test } from "bun:test";
import {
	DEFAULT_DESKTOP_SETTINGS,
	type DesktopSettings,
	loadDesktopSettings,
	saveDesktopSettings,
} from "./desktop-settings";

class MemoryStorage {
	#values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.#values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.#values.set(key, value);
	}
}

describe("desktop settings", () => {
	test("loads defaults when no saved preferences exist", () => {
		expect(loadDesktopSettings(new MemoryStorage())).toEqual(DEFAULT_DESKTOP_SETTINGS);
	});

	test("round-trips supported preferences and ignores invalid payloads", () => {
		const storage = new MemoryStorage();
		const settings: DesktopSettings = {
			...DEFAULT_DESKTOP_SETTINGS,
			theme: "dark",
			defaultApprovalMode: "always-ask",
			defaultThinking: "medium",
			defaultProvider: "openai",
			defaultModel: "gpt-5",
			autoConnect: false,
		};

		saveDesktopSettings(storage, settings);
		expect(loadDesktopSettings(storage)).toEqual(settings);

		storage.setItem("omp.desktop.settings", JSON.stringify({ theme: "neon", autoConnect: "yes" }));
		expect(loadDesktopSettings(storage)).toEqual(DEFAULT_DESKTOP_SETTINGS);
	});
});
