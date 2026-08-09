import { ArrowUp, ChevronDown, FolderGit2, Plus, Settings2, X } from "lucide-react";
import { type FormEvent, useMemo, useRef, useState } from "react";
import type { DesktopRuntimeInfo } from "../../rpc/tauri-rpc-bridge";
import type { DesktopProject } from "../../state/project-factory";

export interface SessionComposerDraft {
	projectId: string;
	title: string;
	executable?: string;
	provider?: string;
	model?: string;
	prompt: string;
}

interface SessionComposerProps {
	runtimeInfo: DesktopRuntimeInfo;
	projects: readonly DesktopProject[];
	busy: boolean;
	error?: string;
	onCancel: () => void;
	onCreate: (draft: SessionComposerDraft) => Promise<void>;
}

export function SessionComposer({ runtimeInfo, projects, busy, error, onCancel, onCreate }: SessionComposerProps) {
	const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
	const [title, setTitle] = useState("");
	const [executable, setExecutable] = useState(runtimeInfo.defaultExecutable);
	const [provider, setProvider] = useState("");
	const [model, setModel] = useState("");
	const [prompt, setPrompt] = useState("");
	const projectSelectRef = useRef<HTMLSelectElement>(null);
	const project = useMemo(() => projects.find(item => item.id === projectId), [projectId, projects]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy || !project || !prompt.trim()) return;
		await onCreate({
			projectId,
			title: title.trim(),
			executable: executable.trim() || undefined,
			provider: provider.trim() || undefined,
			model: model.trim() || undefined,
			prompt: prompt.trim(),
		});
	}

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
							<button
								className="session-context-add"
								type="button"
								aria-label="Choose project context"
								title="Choose project context"
								onClick={() => projectSelectRef.current?.focus()}
							>
								<Plus size={16} />
							</button>
							<label className="session-context-pill">
								<FolderGit2 size={15} aria-hidden="true" />
								<select
									name="projectId"
									ref={projectSelectRef}
									value={projectId}
									onChange={event => setProjectId(event.target.value)}
									disabled={busy}
									required
									aria-label="Project context"
								>
									{projects.map(item => (
										<option key={item.id} value={item.id}>
											{item.title} · {item.cwd}
										</option>
									))}
								</select>
								<ChevronDown size={13} aria-hidden="true" />
							</label>
							{project && <span className="session-context-path mono">{project.cwd}</span>}
						</div>

						<div className="session-composer-actions">
							<details className="session-runtime-settings">
								<summary>
									<Settings2 size={14} aria-hidden="true" />
									<span>Runtime settings</span>
									<span className="session-runtime-summary mono">{model || "CLI default"}</span>
								</summary>
								<div className="session-runtime-panel">
									<label>
										<span>Task title</span>
										<input
											name="title"
											value={title}
											onChange={event => setTitle(event.target.value)}
											disabled={busy}
											placeholder="Derived from project"
										/>
									</label>
									<label>
										<span>OMP executable</span>
										<input
											name="executable"
											value={executable}
											onChange={event => setExecutable(event.target.value)}
											disabled={busy}
											spellCheck={false}
											placeholder="omp"
										/>
									</label>
									<label>
										<span>Provider</span>
										<input
											name="provider"
											value={provider}
											onChange={event => setProvider(event.target.value)}
											disabled={busy}
											placeholder="CLI default"
										/>
									</label>
									<label>
										<span>Model</span>
										<input
											name="model"
											value={model}
											onChange={event => setModel(event.target.value)}
											disabled={busy}
											placeholder="CLI default"
										/>
									</label>
								</div>
							</details>
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
					<span className="mono">Enter to send</span>
					<span>·</span>
					<span>Project context is saved with the task</span>
					<button className="session-composer-cancel" type="button" onClick={onCancel}>
						<X size={13} />
						Cancel
					</button>
				</footer>
			</div>
		</section>
	);
}
