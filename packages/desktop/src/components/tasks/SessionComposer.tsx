import { ArrowUp, ChevronDown, FolderGit2, FolderOpen, Settings2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { RpcModelInfo } from "../../rpc/rpc-session";
import type { DesktopProject } from "../../state/project-factory";

export type SessionThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "auto";
export type SessionApprovalMode = "always-ask" | "write" | "yolo";

export interface SessionComposerDraft {
	projectId: string;
	provider?: string;
	model?: string;
	approvalMode?: SessionApprovalMode;
	thinking?: SessionThinkingLevel;
	prompt: string;
}

export function buildSessionComposerDraft(input: {
	projectId: string;
	provider?: string;
	model?: string;
	approvalMode?: SessionApprovalMode;
	thinking?: SessionThinkingLevel;
	prompt: string;
}): SessionComposerDraft {
	return {
		projectId: input.projectId,
		...(input.provider ? { provider: input.provider } : {}),
		...(input.model ? { model: input.model } : {}),
		...(input.approvalMode ? { approvalMode: input.approvalMode } : {}),
		...(input.thinking ? { thinking: input.thinking } : {}),
		prompt: input.prompt,
	};
}

const APPROVAL_MODES: Array<{ value: SessionApprovalMode; label: string; description: string }> = [
	{ value: "always-ask", label: "批注", description: "每次工具调用前都请求确认" },
	{ value: "write", label: "可编辑", description: "编辑操作自动放行，危险操作确认" },
	{ value: "yolo", label: "完全自主", description: "全程自动执行，不打断" },
];

const THINKING_SLIDER: Array<{ value: SessionThinkingLevel; label: string }> = [
	{ value: "off", label: "off" },
	{ value: "minimal", label: "minimal" },
	{ value: "low", label: "low" },
	{ value: "medium", label: "medium" },
	{ value: "high", label: "high" },
	{ value: "xhigh", label: "xhigh" },
	{ value: "max", label: "max" },
];

const THINKING_SLIDER_MAX = THINKING_SLIDER.length - 1;

export function thinkingSliderIndex(level: SessionThinkingLevel): number {
	const index = THINKING_SLIDER.findIndex(item => item.value === level);
	return index === -1 ? 4 : index;
}

export function thinkingSliderLevel(index: number): SessionThinkingLevel {
	return THINKING_SLIDER[Math.min(Math.max(index, 0), THINKING_SLIDER_MAX)]!.value;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function groupModelsByProvider(models: readonly RpcModelInfo[]): Array<{ provider: string; models: RpcModelInfo[] }> {
	const groups = new Map<string, RpcModelInfo[]>();
	for (const model of models) {
		const list = groups.get(model.provider) ?? [];
		list.push(model);
		groups.set(model.provider, list);
	}
	return [...groups.entries()]
		.map(([provider, providerModels]) => ({ provider, models: providerModels }))
		.sort((left, right) => left.provider.localeCompare(right.provider));
}

interface SessionComposerProps {
	projects: readonly DesktopProject[];
	initialProjectId?: string;
	busy: boolean;
	error?: string;
	onCreate: (draft: SessionComposerDraft) => Promise<void>;
	onOpenProject: () => void;
	availableModels?: RpcModelInfo[];
	onSelectModel?: (provider: string, modelId: string) => Promise<void>;
	onSetThinking?: (level: SessionThinkingLevel) => Promise<void>;
	context?: {
		model?: string;
		percent: number;
		tokens?: number;
		contextWindow?: number;
		modelCost?: number;
	};
}

export function SessionComposer({
	projects,
	initialProjectId,
	busy,
	error,
	onCreate,
	onOpenProject,
	availableModels = [],
	onSelectModel,
	onSetThinking,
	context,
}: SessionComposerProps) {
	const [projectId, setProjectId] = useState(
		initialProjectId && projects.some(project => project.id === initialProjectId)
			? initialProjectId
			: (projects[0]?.id ?? ""),
	);
	const [projectMenuOpen, setProjectMenuOpen] = useState(false);
	const [runtimeMenuOpen, setRuntimeMenuOpen] = useState(false);
	const [approvalMode, setApprovalMode] = useState<SessionApprovalMode>("write");
	const [thinking, setThinking] = useState<SessionThinkingLevel>("auto");
	const [selectedProvider, setSelectedProvider] = useState<string>();
	const [selectedModel, setSelectedModel] = useState<string>();
	const [prompt, setPrompt] = useState("");
	const projectMenuRef = useRef<HTMLDivElement>(null);
	const runtimeMenuRef = useRef<HTMLDivElement>(null);
	const project = useMemo(() => projects.find(item => item.id === projectId), [projectId, projects]);

	function cycleApprovalMode() {
		setApprovalMode(current => {
			const index = APPROVAL_MODES.findIndex(mode => mode.value === current);
			return APPROVAL_MODES[(index + 1) % APPROVAL_MODES.length]!.value;
		});
	}

	useEffect(() => {
		if (!projectMenuOpen && !runtimeMenuOpen) return;
		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (projectMenuRef.current && !projectMenuRef.current.contains(target)) setProjectMenuOpen(false);
			if (runtimeMenuRef.current && !runtimeMenuRef.current.contains(target)) setRuntimeMenuOpen(false);
		}
		window.addEventListener("pointerdown", onPointerDown);
		return () => window.removeEventListener("pointerdown", onPointerDown);
	}, [projectMenuOpen, runtimeMenuOpen]);

	useEffect(() => {
		if (initialProjectId && projects.some(item => item.id === initialProjectId)) setProjectId(initialProjectId);
	}, [initialProjectId, projects]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy || !project || !prompt.trim()) return;
		await onCreate(
			buildSessionComposerDraft({
				projectId,
				provider: selectedProvider,
				model: selectedModel,
				approvalMode,
				thinking,
				prompt: prompt.trim(),
			}),
		);
	}

	const promptTokens = Math.ceil(prompt.trim().length / 4);
	const estimatedCost = context?.modelCost != null ? (promptTokens / 1_000_000) * context.modelCost : undefined;
	const selectedRuntimeModel = selectedModel ?? context?.model ?? "CLI default";
	const approval = APPROVAL_MODES.find(mode => mode.value === approvalMode)!;

	return (
		<section className="session-composer" aria-label="New session workspace">
			<div className="session-composer-stage">
				<header className="session-composer-welcome">
					<div className="session-composer-mark" aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
					<span className="session-composer-kicker mono">omp / new task</span>
					<h1>What should OMP work on?</h1>
					<p>Describe a task and choose the local context where it should run.</p>
				</header>

				<form className="session-composer-card" onSubmit={handleSubmit}>
					<textarea
						className="session-composer-input"
						name="prompt"
						value={prompt}
						onChange={event => setPrompt(event.target.value)}
						disabled={busy}
						autoFocus
						rows={4}
						placeholder="Ask OMP to inspect, build, or fix something…"
						onKeyDown={event => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}
						}}
					/>

					<div className="session-composer-toolbar">
						<div className="session-composer-context">
							<div className="session-context-pop" ref={projectMenuRef}>
								<button
									className="session-context-trigger"
									type="button"
									aria-haspopup="listbox"
									aria-expanded={projectMenuOpen}
									disabled={busy}
									onClick={() => setProjectMenuOpen(open => !open)}
								>
									<FolderGit2 size={15} aria-hidden="true" />
									<span className="session-context-trigger-name">{project?.title ?? "Select project"}</span>
									<ChevronDown size={13} aria-hidden="true" />
								</button>
								{projectMenuOpen && (
									<div className="session-context-menu" role="listbox" aria-label="Project context">
										{projects.map(item => (
											<button
												key={item.id}
												type="button"
												role="option"
												aria-selected={item.id === projectId}
												className="session-context-item"
												data-selected={item.id === projectId}
												onClick={() => {
													setProjectId(item.id);
													setProjectMenuOpen(false);
												}}
											>
												<FolderGit2 size={14} aria-hidden="true" />
												<span className="session-context-item-title">{item.title}</span>
												<span className="session-context-item-cwd mono">{item.cwd}</span>
											</button>
										))}
										<div className="session-context-menu-divider" />
										<button
											type="button"
											className="session-context-item session-context-item-open"
											onClick={() => {
												setProjectMenuOpen(false);
												onOpenProject();
											}}
										>
											<FolderOpen size={14} aria-hidden="true" />
											<span>Open a local folder…</span>
										</button>
									</div>
								)}
							</div>
							{project && <span className="session-context-path mono">{project.cwd}</span>}
						</div>

						<div className="session-composer-actions">
							<button
								type="button"
								className="session-approval-trigger"
								data-mode={approvalMode}
								disabled={busy}
								aria-label={`Approval mode: ${approval.label}`}
								aria-pressed="true"
								title={`${approval.label}: ${approval.description}. Click to change.`}
								onClick={cycleApprovalMode}
							>
								<span className="session-approval-dot" aria-hidden="true" />
								{approval.label}
							</button>

							<div className="session-runtime-pop" ref={runtimeMenuRef} data-open={runtimeMenuOpen}>
								<button
									type="button"
									className="session-runtime-trigger"
									disabled={busy}
									aria-haspopup="menu"
									aria-expanded={runtimeMenuOpen}
									title="Model and reasoning settings"
									onClick={() => setRuntimeMenuOpen(open => !open)}
								>
									<Settings2 size={14} aria-hidden="true" />
									<span className="session-runtime-model mono">{selectedRuntimeModel}</span>
									<span className="session-runtime-sep" aria-hidden="true">
										·
									</span>
									<span className="session-runtime-thinking mono">{thinking}</span>
									<ChevronDown size={12} aria-hidden="true" />
								</button>
								{runtimeMenuOpen && (
									<div className="session-runtime-panel" role="menu" aria-label="Model and reasoning">
										<div className="session-runtime-model-info">
											<span className="session-runtime-model-info-label">Model</span>
											{availableModels.length > 0 ? (
												<>
													<div className="session-runtime-model-list" role="listbox" aria-label="Model">
														{groupModelsByProvider(availableModels).map(group => (
															<div className="session-runtime-model-group" key={group.provider}>
																<span className="session-runtime-model-group-label mono">
																	{group.provider}
																</span>
																{group.models.map(model => (
																	<button
																		key={model.id}
																		type="button"
																		role="option"
																		aria-selected={(selectedModel ?? context?.model) === model.id}
																		className="session-runtime-model-item"
																		data-selected={(selectedModel ?? context?.model) === model.id}
																		disabled={busy}
																		onClick={() => {
																			setSelectedProvider(model.provider);
																			setSelectedModel(model.id);
																			setRuntimeMenuOpen(false);
																			void onSelectModel?.(model.provider, model.id);
																		}}
																	>
																		<span>{model.id}</span>
																		{model.reasoning && (
																			<span className="session-runtime-model-reasoning">R</span>
																		)}
																	</button>
																))}
															</div>
														))}
													</div>
													<small>Loaded from the connected OMP session.</small>
												</>
											) : (
												<>
													<output className="session-runtime-model-info-value mono">
														{selectedRuntimeModel}
													</output>
													<small>Connect OMP to choose from available models.</small>
												</>
											)}
										</div>
										<div className="session-runtime-thinking-info">
											<span className="session-runtime-thinking-info-label">Thinking</span>
											<div className="session-runtime-thinking-control">
												<input
													type="range"
													className="session-runtime-thinking-slider"
													min={0}
													max={THINKING_SLIDER_MAX}
													step={1}
													value={thinkingSliderIndex(thinking)}
													disabled={busy || thinking === "auto"}
													aria-label="Thinking level"
													onChange={event => {
														const level = thinkingSliderLevel(Number(event.target.value));
														setThinking(level);
														void onSetThinking?.(level);
													}}
												/>
												<div className="session-runtime-thinking-scale">
													{THINKING_SLIDER.map(item => (
														<span
															key={item.value}
															className="session-runtime-thinking-tick"
															data-active={thinking === item.value}
														>
															{item.label}
														</span>
													))}
												</div>
											</div>
											<label className="session-runtime-thinking-auto">
												<input
													type="checkbox"
													checked={thinking === "auto"}
													disabled={busy}
													onChange={event => {
														const level = event.target.checked ? "auto" : "medium";
														setThinking(level);
														void onSetThinking?.(level);
													}}
												/>
												<span>Auto-adjust thinking</span>
											</label>
										</div>
									</div>
								)}
							</div>

							<button
								className="session-composer-send"
								type="submit"
								disabled={busy || !project || !prompt.trim()}
								aria-label="Send task"
							>
								{busy ? <span className="activity-spinner" /> : <ArrowUp size={17} />}
							</button>
						</div>
					</div>
					{error && (
						<p className="dialog-error session-composer-error" role="alert">
							{error}
						</p>
					)}
				</form>

				<footer className="session-composer-footer">
					<div className="session-composer-status mono">
						{context && (
							<span className="session-status-context" title="Current context usage">
								{Math.round(context.percent)}%
								{context.tokens != null && context.contextWindow != null
									? ` · ${formatTokens(context.tokens)}/${formatTokens(context.contextWindow)}`
									: ""}
							</span>
						)}
						{prompt.trim().length > 0 && (
							<span className="session-status-estimate" title="Estimated from prompt length">
								≈{promptTokens.toLocaleString()} tokens
								{estimatedCost != null ? ` · ≈$${estimatedCost.toFixed(4)}` : ""}
							</span>
						)}
					</div>
					<div className="session-composer-footer-actions">
						<span className="mono">Enter to send</span>
						<span aria-hidden="true">·</span>
						<span className="session-composer-save-note">Project context is saved with the task</span>
					</div>
				</footer>
			</div>
		</section>
	);
}
