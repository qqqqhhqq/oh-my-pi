import {
	getDefault,
	getEnumValues,
	getType,
	isCredential,
	type SettingPath,
	type Settings,
	type SettingValue,
} from "../../config/settings";
import { SETTING_TABS, type SettingTab, TAB_METADATA } from "../../config/settings-schema";
import { getAllSettingDefs, getSettingDef, type SettingDef } from "../components/settings-defs";

export type RpcJsonValue = null | boolean | number | string | RpcJsonValue[] | { [key: string]: RpcJsonValue };

export type RpcSettingType = "boolean" | "enum" | "number" | "string" | "array" | "record";

export interface RpcSettingOption {
	value: string;
	label: string;
	description?: string;
}

export interface RpcSettingItem {
	path: SettingPath;
	type: RpcSettingType;
	tab: SettingTab;
	group?: string;
	label: string;
	description: string;
	value?: RpcJsonValue;
	defaultValue?: RpcJsonValue;
	redacted?: true;
	options?: RpcSettingOption[];
	ordered?: boolean;
}

export interface RpcSettingTab {
	id: SettingTab;
	label: string;
}

export interface RpcSettingsSnapshot {
	cwd: string;
	agentDir: string;
	tabs: RpcSettingTab[];
	settings: RpcSettingItem[];
}

function toJsonValue(value: unknown): RpcJsonValue | undefined {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (Array.isArray(value)) return value.map(item => toJsonValue(item) ?? null);
	if (typeof value === "object") {
		const result: { [key: string]: RpcJsonValue } = {};
		for (const [key, item] of Object.entries(value)) {
			const jsonValue = toJsonValue(item);
			if (jsonValue !== undefined) result[key] = jsonValue;
		}
		return result;
	}
	return undefined;
}

function optionsForDefinition(definition: SettingDef): RpcSettingOption[] | undefined {
	if (definition.type === "submenu" || definition.type === "multiselect") {
		return definition.options.map(option => ({
			value: option.value,
			label: option.label,
			...(option.description ? { description: option.description } : {}),
		}));
	}
	if (definition.type === "enum") {
		return getEnumValues(definition.path)?.map(value => ({ value, label: value }));
	}
	return undefined;
}

function settingItem(settings: Settings, definition: SettingDef): RpcSettingItem {
	const path = definition.path;
	const currentValue = settings.get(path);
	const redacted = isCredential(path) && Boolean(currentValue);
	const value = redacted ? undefined : toJsonValue(currentValue);
	const defaultValue = toJsonValue(getDefault(path));
	const item: RpcSettingItem = {
		path,
		type: getType(path),
		tab: definition.tab,
		label: definition.label,
		description: definition.description,
		...(definition.group ? { group: definition.group } : {}),
		...(value === undefined ? {} : { value }),
		...(defaultValue === undefined ? {} : { defaultValue }),
		...(redacted ? { redacted: true } : {}),
	};
	const options = optionsForDefinition(definition);
	if (options && options.length > 0) item.options = options;
	if (definition.type === "multiselect") item.ordered = definition.ordered;
	return item;
}

function definitionForPath(path: string): SettingDef {
	const definition = getSettingDef(path as SettingPath);
	if (!definition) throw new Error(`Unknown setting: ${path}`);
	return definition;
}

function validateValue(path: SettingPath, value: RpcJsonValue): void {
	const type = getType(path);
	switch (type) {
		case "boolean":
			if (typeof value !== "boolean") throw new Error(`Setting ${path} expects a boolean`);
			break;
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new Error(`Setting ${path} expects a finite number`);
			}
			break;
		case "string":
			if (typeof value !== "string") throw new Error(`Setting ${path} expects a string`);
			break;
		case "enum": {
			if (typeof value !== "string") throw new Error(`Setting ${path} expects a string enum value`);
			const values = getEnumValues(path);
			if (values && !values.includes(value)) {
				throw new Error(`Invalid value for ${path}: ${value}. Valid values: ${values.join(", ")}`);
			}
			break;
		}
		case "array":
			if (!Array.isArray(value)) throw new Error(`Setting ${path} expects an array`);
			break;
		case "record":
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				throw new Error(`Setting ${path} expects an object`);
			}
			break;
	}
}

export function getRpcSettingsSnapshot(settings: Settings): RpcSettingsSnapshot {
	return {
		cwd: settings.getCwd(),
		agentDir: settings.getAgentDir(),
		tabs: SETTING_TABS.map(id => ({ id, label: TAB_METADATA[id].label })),
		settings: getAllSettingDefs().map(definition => settingItem(settings, definition)),
	};
}

export function setRpcSetting(settings: Settings, path: string, value: RpcJsonValue): RpcSettingItem {
	const definition = definitionForPath(path);
	const settingPath = definition.path;
	validateValue(settingPath, value);
	settings.set(settingPath, value as SettingValue<SettingPath>);
	return settingItem(settings, definition);
}

export function resetRpcSetting(settings: Settings, path: string): RpcSettingItem {
	const definition = definitionForPath(path);
	const settingPath = definition.path;
	settings.set(settingPath, getDefault(settingPath) as SettingValue<SettingPath>);
	return settingItem(settings, definition);
}
