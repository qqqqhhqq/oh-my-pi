import { Check, LogIn, RefreshCw, RotateCcw, Search, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RpcJsonValue, RpcLoginProvider, RpcSettingItem, RpcSettingsSnapshot } from "../../rpc/rpc-session";
import type {
	DesktopApprovalMode,
	DesktopSettings,
	DesktopTheme,
	DesktopThinkingLevel,
} from "../../state/desktop-settings";

type RuntimeStatus = "preview" | "disconnected" | "connecting" | "connected" | "error";

interface SettingsDialogProps {
	open: boolean;
	runtimeStatus: RuntimeStatus;
	desktopSettings: DesktopSettings;
	snapshot?: RpcSettingsSnapshot;
	loading: boolean;
	error?: string;
	onClose: () => void;
	onRefresh: () => void;
	onDesktopSettingsChange: (settings: DesktopSettings) => void;
	onSetBackendSetting: (path: string, value: RpcJsonValue) => Promise<void>;
	onResetBackendSetting: (path: string) => Promise<void>;
	loginProviders?: RpcLoginProvider[];
	onLogin: (providerId: string) => Promise<void>;
}

const APPROVAL_MODES: Array<{ value: DesktopApprovalMode; label: string }> = [
	{ value: "always-ask", label: "Always ask" },
	{ value: "write", label: "Workspace write" },
	{ value: "yolo", label: "Autonomous" },
];

const THINKING_LEVELS: Array<{ value: DesktopThinkingLevel; label: string }> = [
	{ value: "auto", label: "Auto" },
	{ value: "off", label: "Off" },
	{ value: "minimal", label: "Minimal" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Xhigh" },
	{ value: "max", label: "Max" },
];

const THEME_OPTIONS: Array<{ value: DesktopTheme; label: string }> = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isJsonValue(value: unknown): value is RpcJsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isJsonValue);
	return isRecord(value) && Object.values(value).every(isJsonValue);
}

function displayValue(value: RpcJsonValue | undefined): string {
	if (value === undefined) return "Not set";
	if (typeof value === "boolean") return value ? "On" : "Off";
	if (typeof value === "string" || typeof value === "number") return String(value);
	return JSON.stringify(value);
}

function editValue(item: RpcSettingItem): string {
	if (item.value === undefined) return "";
	if (item.type === "array" || item.type === "record") return JSON.stringify(item.value, null, 2);
	return String(item.value);
}

function parseEditValue(item: RpcSettingItem, draft: string): RpcJsonValue {
	if (item.type === "number") {
		const value = Number(draft);
		if (!Number.isFinite(value)) throw new Error("Enter a valid number");
		return value;
	}
	if (item.type === "array" || item.type === "record") {
		const value: unknown = JSON.parse(draft);
		if (!isJsonValue(value)) throw new Error("Enter valid JSON");
		if (item.type === "array" && !Array.isArray(value)) throw new Error("Enter a JSON array");
		if (item.type === "record" && (!isRecord(value) || Array.isArray(value))) {
			throw new Error("Enter a JSON object");
		}
		return value;
	}
	return draft;
}

interface BackendSettingRowProps {
	item: RpcSettingItem;
	onSave: (value: RpcJsonValue) => Promise<void>;
	onReset: () => Promise<void>;
}

function BackendSettingRow({ item, onSave, onReset }: BackendSettingRowProps) {
	const [draft, setDraft] = useState(() => editValue(item));
	const [busy, setBusy] = useState(false);
	const [localError, setLocalError] = useState<string>();

	useEffect(() => setDraft(editValue(item)), [item]);

	async function save(value: RpcJsonValue) {
		setBusy(true);
		setLocalError(undefined);
		try {
			await onSave(value);
		} catch (error) {
			setLocalError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	}

	async function submitDraft() {
		try {
			await save(parseEditValue(item, draft));
		} catch (error) {
			setLocalError(error instanceof Error ? error.message : String(error));
		}
	}

	const selectedArrayValues = Array.isArray(item.value)
		? item.value.filter((value): value is string => typeof value === "string")
		: [];
	const control =
		item.type === "boolean" ? (
			<label className="settings-switch-row">
				<input
					type="checkbox"
					checked={item.value === true}
					disabled={busy}
					onChange={event => void save(event.target.checked)}
				/>
				<span className="settings-switch" aria-hidden="true" />
				<span>{item.value === true ? "On" : "Off"}</span>
			</label>
		) : item.options && item.options.length > 0 && item.type === "array" ? (
			<select
				className="settings-control settings-multi-select"
				multiple
				value={selectedArrayValues}
				disabled={busy}
				onChange={event => void save(Array.from(event.target.selectedOptions, option => option.value))}
			>
				{item.options.map(option => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		) : item.options && item.options.length > 0 ? (
			<select
				className="settings-control"
				value={draft}
				disabled={busy}
				onChange={event => {
					setDraft(event.target.value);
					void save(item.type === "number" ? Number(event.target.value) : event.target.value);
				}}
			>
				{item.options.map(option => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		) : (
			<div className="settings-freeform-control">
				{item.type === "array" || item.type === "record" ? (
					<textarea
						className="settings-control settings-json-control"
						rows={3}
						value={draft}
						disabled={busy}
						onChange={event => setDraft(event.target.value)}
					/>
				) : (
					<input
						className="settings-control"
						type={item.type === "number" ? "number" : item.redacted ? "password" : "text"}
						value={draft}
						placeholder={item.redacted ? "Configured; enter a replacement" : "Not set"}
						disabled={busy}
						onChange={event => setDraft(event.target.value)}
					/>
				)}
				<button className="settings-inline-button" type="button" disabled={busy} onClick={() => void submitDraft()}>
					Save
				</button>
			</div>
		);

	return (
		<div className="settings-row">
			<div className="settings-row-copy">
				<strong>{item.label}</strong>
				<span>{item.description}</span>
				<small>
					{item.path}
					{item.redacted ? " · Secret value is hidden" : ` · Default: ${displayValue(item.defaultValue)}`}
				</small>
				{localError && <em className="settings-error">{localError}</em>}
			</div>
			<div className="settings-row-actions">
				{control}
				<button
					className="settings-reset-button"
					type="button"
					disabled={busy}
					title="Reset to backend default"
					onClick={() => void onReset()}
				>
					<RotateCcw size={13} aria-hidden="true" />
					Reset
				</button>
			</div>
		</div>
	);
}

interface LocalSettingsProps {
	settings: DesktopSettings;
	onChange: (settings: DesktopSettings) => void;
}

function LocalSettings({ settings, onChange }: LocalSettingsProps) {
	return (
		<div className="settings-content-scroll">
			<div className="settings-section-heading">
				<span className="settings-eyebrow">Desktop</span>
				<h2>New task defaults</h2>
				<p>
					These preferences are applied when you create or reconnect a task. Current sessions keep their own
					controls.
				</p>
			</div>
			<div className="settings-card">
				<label className="settings-local-row">
					<span>
						<strong>Theme</strong>
						<small>Choose the Desktop appearance.</small>
					</span>
					<select
						className="settings-control"
						value={settings.theme}
						onChange={event => onChange({ ...settings, theme: event.target.value as DesktopTheme })}
					>
						{THEME_OPTIONS.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="settings-local-row">
					<span>
						<strong>Default approval mode</strong>
						<small>Controls how much confirmation new tasks require.</small>
					</span>
					<select
						className="settings-control"
						value={settings.defaultApprovalMode}
						onChange={event =>
							onChange({ ...settings, defaultApprovalMode: event.target.value as DesktopApprovalMode })
						}
					>
						{APPROVAL_MODES.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="settings-local-row">
					<span>
						<strong>Default thinking level</strong>
						<small>Initial reasoning effort for new tasks.</small>
					</span>
					<select
						className="settings-control"
						value={settings.defaultThinking}
						onChange={event =>
							onChange({ ...settings, defaultThinking: event.target.value as DesktopThinkingLevel })
						}
					>
						{THINKING_LEVELS.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="settings-local-row">
					<span>
						<strong>Default provider</strong>
						<small>Optional provider passed to the OMP runtime.</small>
					</span>
					<input
						className="settings-control"
						value={settings.defaultProvider ?? ""}
						placeholder="OMP default"
						onChange={event => onChange({ ...settings, defaultProvider: event.target.value || undefined })}
					/>
				</label>
				<label className="settings-local-row">
					<span>
						<strong>Default model</strong>
						<small>Optional model id passed to the OMP runtime.</small>
					</span>
					<input
						className="settings-control"
						value={settings.defaultModel ?? ""}
						placeholder="OMP default"
						onChange={event => onChange({ ...settings, defaultModel: event.target.value || undefined })}
					/>
				</label>
				<label className="settings-local-row settings-checkbox-row">
					<span>
						<strong>Auto-connect selected tasks</strong>
						<small>Reconnect a saved task when it is selected in the rail.</small>
					</span>
					<input
						type="checkbox"
						checked={settings.autoConnect}
						onChange={event => onChange({ ...settings, autoConnect: event.target.checked })}
					/>
				</label>
			</div>
		</div>
	);
}

interface ProviderAuthProps {
	providers: RpcLoginProvider[];
	onLogin: (providerId: string) => Promise<void>;
	onMessage: (message: string) => void;
}

function ProviderAuth({ providers, onLogin, onMessage }: ProviderAuthProps) {
	return (
		<section className="settings-group">
			<h3>Accounts</h3>
			<div className="settings-card">
				{providers.length === 0 ? (
					<div className="settings-provider-empty">No OAuth providers are exposed by this OMP runtime.</div>
				) : (
					providers.map(provider => (
						<div className="settings-provider-row" key={provider.id}>
							<div>
								<strong>{provider.name}</strong>
								<small className={provider.authenticated ? "settings-provider-ok" : undefined}>
									{provider.authenticated ? "Connected" : provider.available ? "Not connected" : "Unavailable"}
								</small>
							</div>
							<button
								className="settings-inline-button"
								type="button"
								disabled={!provider.available}
								onClick={() => {
									void onLogin(provider.id).then(
										() => onMessage(`${provider.name} sign-in completed`),
										error => onMessage(error instanceof Error ? error.message : String(error)),
									);
								}}
							>
								<LogIn size={13} aria-hidden="true" />
								{provider.authenticated ? "Sign in again" : "Sign in"}
							</button>
						</div>
					))
				)}
			</div>
		</section>
	);
}

export function SettingsDialog({
	open,
	runtimeStatus,
	desktopSettings,
	snapshot,
	loading,
	error,
	onClose,
	onRefresh,
	onDesktopSettingsChange,
	onSetBackendSetting,
	onResetBackendSetting,
	loginProviders = [],
	onLogin,
}: SettingsDialogProps) {
	const [activeTab, setActiveTab] = useState("desktop");
	const [query, setQuery] = useState("");
	const [saveMessage, setSaveMessage] = useState<string>();

	useEffect(() => {
		if (!open) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, open]);

	useEffect(() => {
		if (activeTab === "desktop") return;
		if (!snapshot?.tabs.some(tab => tab.id === activeTab)) setActiveTab("desktop");
	}, [activeTab, snapshot]);

	const activeItems = useMemo(() => {
		if (!snapshot || activeTab === "desktop") return [];
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return snapshot.settings.filter(item => {
			if (item.tab !== activeTab) return false;
			if (!normalizedQuery) return true;
			return `${item.path} ${item.label} ${item.description}`.toLocaleLowerCase().includes(normalizedQuery);
		});
	}, [activeTab, query, snapshot]);

	const groupedItems = useMemo(() => {
		const groups = new Map<string, RpcSettingItem[]>();
		for (const item of activeItems) {
			const group = item.group ?? "General";
			groups.set(group, [...(groups.get(group) ?? []), item]);
		}
		return [...groups.entries()];
	}, [activeItems]);

	if (!open) return null;

	async function saveBackendSetting(item: RpcSettingItem, value: RpcJsonValue) {
		await onSetBackendSetting(item.path, value);
		setSaveMessage(`${item.label} saved`);
	}

	async function resetBackendSetting(item: RpcSettingItem) {
		await onResetBackendSetting(item.path);
		setSaveMessage(`${item.label} reset`);
	}

	const activeLabel = activeTab === "desktop" ? "Desktop" : snapshot?.tabs.find(tab => tab.id === activeTab)?.label;

	return (
		<div
			className="settings-overlay"
			role="presentation"
			onMouseDown={event => event.target === event.currentTarget && onClose()}
		>
			<section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
				<header className="settings-header">
					<div className="settings-header-title">
						<div className="settings-header-icon" aria-hidden="true">
							<Settings2 size={17} />
						</div>
						<div>
							<span className="settings-eyebrow">OMP Desktop</span>
							<h1>Settings</h1>
						</div>
					</div>
					<div className="settings-header-actions">
						{loading && <span className="settings-loading">Loading backend settings…</span>}
						<button className="icon-button" type="button" aria-label="Refresh settings" onClick={onRefresh}>
							<RefreshCw size={15} aria-hidden="true" />
						</button>
						<button className="icon-button" type="button" aria-label="Close settings" onClick={onClose}>
							<X size={16} aria-hidden="true" />
						</button>
					</div>
				</header>
				<div className="settings-layout">
					<nav className="settings-nav" aria-label="Settings categories">
						<button
							className="settings-nav-item"
							data-active={activeTab === "desktop"}
							type="button"
							onClick={() => setActiveTab("desktop")}
						>
							<span>Desktop</span>
							<small>Defaults</small>
						</button>
						{snapshot?.tabs.map(tab => (
							<button
								className="settings-nav-item"
								data-active={activeTab === tab.id}
								type="button"
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
							>
								<span>{tab.label}</span>
								<small>OMP backend</small>
							</button>
						))}
					</nav>
					<main className="settings-main">
						<div className="settings-main-toolbar">
							<div>
								<span className="settings-eyebrow">Configuration</span>
								<h2>{activeLabel ?? "Desktop"}</h2>
							</div>
							{activeTab !== "desktop" && (
								<label className="settings-search">
									<Search size={14} aria-hidden="true" />
									<input
										type="search"
										aria-label="Search settings"
										placeholder="Search settings"
										value={query}
										onChange={event => setQuery(event.target.value)}
									/>
								</label>
							)}
						</div>
						{error && <div className="settings-error-banner">{error}</div>}
						{saveMessage && (
							<div className="settings-save-message" role="status">
								<Check size={13} aria-hidden="true" />
								{saveMessage}
							</div>
						)}
						{activeTab === "desktop" ? (
							<LocalSettings settings={desktopSettings} onChange={onDesktopSettingsChange} />
						) : snapshot ? (
							<div className="settings-content-scroll">
								{runtimeStatus !== "connected" && (
									<div className="settings-runtime-note">
										OMP runtime is not connected. Backend values below are the last loaded snapshot; reconnect
										to refresh them.
									</div>
								)}
								{activeTab === "providers" && (
									<ProviderAuth providers={loginProviders} onLogin={onLogin} onMessage={setSaveMessage} />
								)}
								{groupedItems.length === 0 ? (
									<div className="settings-empty">No settings match this search.</div>
								) : (
									groupedItems.map(([group, items]) => (
										<section className="settings-group" key={group}>
											<h3>{group}</h3>
											<div className="settings-card">
												{items.map(item => (
													<BackendSettingRow
														key={item.path}
														item={item}
														onSave={value => saveBackendSetting(item, value)}
														onReset={() => resetBackendSetting(item)}
													/>
												))}
											</div>
										</section>
									))
								)}
							</div>
						) : (
							<div className="settings-empty">
								Connect OMP to load backend settings. Desktop defaults remain available here.
							</div>
						)}
					</main>
				</div>
				<footer className="settings-footer">
					<span>
						{snapshot
							? `Config directory: ${snapshot.agentDir}`
							: "Backend settings are provided by the local OMP runtime."}
					</span>
					<button className="secondary-button" type="button" onClick={onClose}>
						Done
					</button>
				</footer>
			</section>
		</div>
	);
}
