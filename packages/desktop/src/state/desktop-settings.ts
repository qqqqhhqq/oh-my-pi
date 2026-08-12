import type { StorageLike } from "./task-catalog";

export const DESKTOP_SETTINGS_KEY = "omp.desktop.settings";

export type DesktopTheme = "light" | "dark" | "system";
export type DesktopApprovalMode = "always-ask" | "write" | "yolo";
export type DesktopThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export interface DesktopSettings {
	theme: DesktopTheme;
	defaultApprovalMode: DesktopApprovalMode;
	defaultThinking: DesktopThinkingLevel;
	defaultProvider?: string;
	defaultModel?: string;
	autoConnect: boolean;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
	theme: "light",
	defaultApprovalMode: "write",
	defaultThinking: "auto",
	autoConnect: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isDesktopSettings(value: unknown): value is DesktopSettings {
	if (!isRecord(value)) return false;
	return (
		(value.theme === "light" || value.theme === "dark" || value.theme === "system") &&
		(value.defaultApprovalMode === "always-ask" ||
			value.defaultApprovalMode === "write" ||
			value.defaultApprovalMode === "yolo") &&
		(value.defaultThinking === "off" ||
			value.defaultThinking === "minimal" ||
			value.defaultThinking === "low" ||
			value.defaultThinking === "medium" ||
			value.defaultThinking === "high" ||
			value.defaultThinking === "xhigh" ||
			value.defaultThinking === "max" ||
			value.defaultThinking === "auto") &&
		isOptionalString(value.defaultProvider) &&
		isOptionalString(value.defaultModel) &&
		typeof value.autoConnect === "boolean"
	);
}

export function loadDesktopSettings(storage: StorageLike): DesktopSettings {
	const raw = storage.getItem(DESKTOP_SETTINGS_KEY);
	if (raw === null) return { ...DEFAULT_DESKTOP_SETTINGS };
	try {
		const value: unknown = JSON.parse(raw);
		return isDesktopSettings(value) ? value : { ...DEFAULT_DESKTOP_SETTINGS };
	} catch {
		return { ...DEFAULT_DESKTOP_SETTINGS };
	}
}

export function saveDesktopSettings(storage: StorageLike, settings: DesktopSettings): void {
	storage.setItem(DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
}
