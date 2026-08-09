import { ArrowUp, Check, CircleStop, MoreHorizontal, Paperclip, Sparkles, X } from "lucide-react";
import { type ComponentPropsWithoutRef, type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OmpIcon } from "../../icons/semantic-icons";
import type { ConversationEntry, DesktopTask, DesktopTaskRuntime } from "../../state/desktop-state";

interface ConversationPaneProps {
	task: DesktopTask;
	entries: ConversationEntry[];
	runtime: DesktopTaskRuntime;
	draft: string;
	onDraftChange: (value: string) => void;
	onPrompt: (message: string) => Promise<void>;
	onAbort: () => Promise<void>;
	onRefresh: () => Promise<void>;
	onManageTask: () => void;
}

const taskStatusCopy: Record<DesktopTask["status"], string> = {
	running: "OMP is working",
	waiting: "Waiting for input",
	review: "Ready for review",
	completed: "Completed",
	failed: "Needs attention",
};

function SafeMarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">) {
	if (!href) return <>{children}</>;
	try {
		const url = new URL(href);
		if (url.protocol !== "http:" && url.protocol !== "https:") return <>{children}</>;
		return (
			<a href={url.href} target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		);
	} catch {
		return <>{children}</>;
	}
}

function toolTurnStatus(steps: readonly ConversationEntry[]): "running" | "failed" | "complete" {
	if (steps.some(step => step.status === "failed")) return "failed";
	if (steps.some(step => step.status !== "complete")) return "running";
	return "complete";
}

function ToolTurn({ turnId, steps }: { turnId: string; steps: ConversationEntry[] }) {
	const status = toolTurnStatus(steps);
	const stepsRef = useRef<HTMLDivElement>(null);
	const shouldFollowSteps = useRef(true);

	useEffect(() => {
		if (status === "complete" || !shouldFollowSteps.current) return;
		const container = stepsRef.current;
		if (!container) return;
		container.scrollTop = container.scrollHeight;
	}, [status, steps]);

	return (
		<article className="tool-turn" data-status={status} data-turn-id={turnId}>
			<details open={status !== "complete"}>
				<summary className="tool-card-header">
					<span className="tool-state-icon" aria-hidden="true">
						{status === "complete" ? (
							<Check size={13} />
						) : status === "failed" ? (
							<X size={13} />
						) : (
							<span className="activity-spinner" />
						)}
					</span>
					<strong>
						{status === "running"
							? "Running tools"
							: status === "failed"
								? "Tool run needs attention"
								: "Tool run"}
					</strong>
					<span className="tool-meta mono">{steps.length} steps</span>
				</summary>
				<div
					className="tool-turn-steps"
					ref={stepsRef}
					aria-label="Tool execution steps"
					onScroll={event => {
						const element = event.currentTarget;
						shouldFollowSteps.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
					}}
				>
					{steps.map(step => (
						<details
							className="tool-turn-step"
							data-status={step.status}
							key={step.id}
							open={step.status !== "complete"}
						>
							<summary className="tool-card-header">
								<span className="tool-state-icon" aria-hidden="true">
									{step.status === "complete" ? (
										<Check size={13} />
									) : step.status === "failed" ? (
										<X size={13} />
									) : (
										<span className="activity-spinner" />
									)}
								</span>
								<strong>{step.title}</strong>
								<span className="tool-meta mono">{step.meta}</span>
							</summary>
							<pre className="tool-output">{step.body}</pre>
						</details>
					))}
				</div>
			</details>
		</article>
	);
}

type TranscriptItem =
	| { kind: "entry"; entry: ConversationEntry }
	| { kind: "tool-turn"; turnId: string; steps: ConversationEntry[] };

function transcriptItems(entries: readonly ConversationEntry[]): TranscriptItem[] {
	const toolTurns = new Map<string, ConversationEntry[]>();
	for (const entry of entries) {
		if (entry.kind !== "tool") continue;
		const turnId = entry.turnId ?? `history-${entry.id}`;
		const steps = toolTurns.get(turnId);
		if (steps) steps.push(entry);
		else toolTurns.set(turnId, [entry]);
	}

	const items: TranscriptItem[] = [];
	const displayedToolTurns = new Set<string>();
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index]!;
		if (entry.kind === "turn") continue;
		if (entry.kind !== "tool") {
			items.push({ kind: "entry", entry });
			continue;
		}
		const turnId = entry.turnId ?? `history-${entry.id}`;
		if (displayedToolTurns.has(turnId)) continue;
		displayedToolTurns.add(turnId);
		items.push({ kind: "tool-turn", turnId, steps: toolTurns.get(turnId) ?? [entry] });
	}
	return items;
}

function TranscriptEntry({ entry }: { entry: ConversationEntry }) {
	if (entry.kind === "turn") return null;
	if (entry.kind === "user") {
		return (
			<article className="transcript-entry transcript-user">
				<div className="entry-meta">{entry.meta}</div>
				<div className="user-prompt">{entry.body}</div>
			</article>
		);
	}

	return (
		<article className={`transcript-entry transcript-${entry.kind}`}>
			<div className="assistant-gutter">
				<span className="assistant-mark">π</span>
			</div>
			<div className="assistant-content">
				<div className="entry-meta">{entry.meta}</div>
				{entry.title && <h2>{entry.title}</h2>}
				<ReactMarkdown components={{ a: SafeMarkdownLink }} remarkPlugins={[remarkGfm]}>
					{entry.body}
				</ReactMarkdown>
			</div>
		</article>
	);
}

export function ConversationPane({
	task,
	entries,
	runtime,
	draft,
	onDraftChange,
	onPrompt,
	onAbort,
	onRefresh,
	onManageTask,
}: ConversationPaneProps) {
	const [submitting, setSubmitting] = useState(false);
	const [composerError, setComposerError] = useState<string>();
	const connected = runtime.status === "connected";

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const message = draft.trim();
		if (!message || !connected || submitting) return;
		setSubmitting(true);
		setComposerError(undefined);
		try {
			await onPrompt(message);
			onDraftChange("");
		} catch (error) {
			setComposerError(error instanceof Error ? error.message : String(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<section className="conversation-pane" aria-label="Conversation">
			<header className="conversation-header">
				<div className="conversation-title">
					<div className="title-row">
						<h1>{task.title}</h1>
						<span className={`task-state task-state-${task.status}`}>
							<span className={`status-dot status-${task.status}`} aria-hidden="true" />
							{taskStatusCopy[task.status]}
						</span>
					</div>
					<div className="task-runtime-strip mono">
						<span>
							<OmpIcon name="model" />
							{task.model}
						</span>
						<span>
							<OmpIcon name="thinking" />
							{task.thinking}
						</span>
						<span className="runtime-cwd">
							<OmpIcon name="cwd" />
							{task.cwd}
						</span>
						<span>
							<OmpIcon name="context" />
							{task.contextPercent}%
						</span>
					</div>
				</div>
				<div className="conversation-actions">
					<button
						className="icon-button"
						type="button"
						disabled={!connected}
						aria-label="Refresh task"
						title={connected ? "Refresh task state" : "Connect RPC to refresh"}
						onClick={() => void onRefresh()}
					>
						<OmpIcon name="refresh" />
					</button>
					<button className="icon-button" type="button" aria-label="Manage selected task" onClick={onManageTask}>
						<MoreHorizontal size={17} />
					</button>
				</div>
			</header>

			<div className="transcript" aria-live="polite">
				<div className="session-marker mono">
					<span>session</span>
					<span className="marker-line" />
					<span>{task.branch}</span>
				</div>
				{transcriptItems(entries).map(item =>
					item.kind === "tool-turn" ? (
						<ToolTurn key={item.turnId} turnId={item.turnId} steps={item.steps} />
					) : (
						<TranscriptEntry entry={item.entry} key={item.entry.id} />
					),
				)}
			</div>

			<footer className="composer-wrap">
				<form className="composer" data-disabled={!connected} onSubmit={handleSubmit}>
					<textarea
						aria-label="Prompt"
						placeholder="Ask OMP to build, inspect, or fix…"
						disabled={!connected || submitting}
						rows={2}
						value={draft}
						onChange={event => onDraftChange(event.target.value)}
						onKeyDown={event => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								event.currentTarget.form?.requestSubmit();
							}
						}}
					/>
					<div className="composer-toolbar">
						<div className="composer-tools">
							<button type="button" disabled aria-label="Attach context">
								<Paperclip size={15} />
							</button>
							<button type="button" disabled className="mode-pill">
								<Sparkles size={14} />
								Agent
							</button>
							<button type="button" disabled className="mode-pill mono">
								{task.model}
							</button>
						</div>
						<div className="composer-submit">
							<span className={composerError ? "composer-error" : undefined}>
								{composerError ??
									(connected ? "Enter to send · Shift+Enter for newline" : "Connect RPC to send prompts")}
							</span>
							{task.status === "running" && connected ? (
								<button type="button" onClick={() => void onAbort()} aria-label="Stop task">
									<CircleStop size={17} />
								</button>
							) : (
								<button
									type="submit"
									disabled={!connected || !draft.trim() || submitting}
									aria-label="Send prompt"
								>
									{submitting ? <span className="activity-spinner" /> : <ArrowUp size={17} />}
								</button>
							)}
						</div>
					</div>
				</form>
			</footer>
		</section>
	);
}
