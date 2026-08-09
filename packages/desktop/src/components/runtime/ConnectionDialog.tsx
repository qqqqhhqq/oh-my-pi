import { Box, FolderGit2, PlugZap, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { RpcLaunchConfig } from "../../rpc/rpc-session";
import type { DesktopRuntimeInfo } from "../../rpc/tauri-rpc-bridge";

interface ConnectionDialogProps {
	open: boolean;
	runtimeInfo: DesktopRuntimeInfo;
	initialConfig: RpcLaunchConfig;
	workspaceReadOnly?: boolean;
	sessionPath?: string;
	restoreFailed?: boolean;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onConnect: (config: RpcLaunchConfig, restoreSession: boolean) => Promise<void>;
}

export function ConnectionDialog({
	open,
	runtimeInfo,
	initialConfig,
	workspaceReadOnly = false,
	sessionPath,
	restoreFailed = false,
	busy,
	error,
	onClose,
	onConnect,
}: ConnectionDialogProps) {
	const [cwd, setCwd] = useState(initialConfig.cwd || runtimeInfo.defaultWorkspace);
	const [executable, setExecutable] = useState(initialConfig.executable ?? runtimeInfo.defaultExecutable);
	const [restoreSession, setRestoreSession] = useState(Boolean(sessionPath) && !restoreFailed);

	useEffect(() => {
		if (!open) return;
		setCwd(initialConfig.cwd || runtimeInfo.defaultWorkspace);
		setExecutable(initialConfig.executable ?? runtimeInfo.defaultExecutable);
		setRestoreSession(Boolean(sessionPath) && !restoreFailed);
	}, [open, runtimeInfo, initialConfig, sessionPath, restoreFailed]);

	if (!open) return null;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await onConnect(
			{
				...initialConfig,
				cwd: cwd.trim(),
				executable: executable.trim() || undefined,
			},
			restoreSession,
		);
	}

	return (
		<div className="dialog-backdrop" role="presentation">
			<section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-title">
				<header>
					<div className="dialog-icon" aria-hidden="true">
						<PlugZap size={18} />
					</div>
					<div>
						<h2 id="connection-title">Connect OMP runtime</h2>
						<p>
							Start a real <span className="mono">rpc-ui</span> session for this task.
						</p>
					</div>
					<button
						className="icon-button"
						type="button"
						onClick={onClose}
						disabled={busy}
						aria-label="Close dialog"
					>
						<X size={16} />
					</button>
				</header>

				<form onSubmit={handleSubmit}>
					<label>
						<span>
							<FolderGit2 size={14} /> {workspaceReadOnly ? "Project folder" : "Workspace folder"}
						</span>
						<input
							value={cwd}
							onChange={event => setCwd(event.target.value)}
							required
							disabled={busy}
							readOnly={workspaceReadOnly}
							spellCheck={false}
						/>
					</label>
					<label>
						<span>
							<Box size={14} /> OMP executable or source entry
						</span>
						<input
							value={executable}
							onChange={event => setExecutable(event.target.value)}
							disabled={busy}
							spellCheck={false}
							placeholder="omp"
						/>
					</label>
					{sessionPath && (
						<label className="session-restore-option">
							<input
								type="checkbox"
								checked={restoreSession}
								onChange={event => setRestoreSession(event.target.checked)}
								disabled={busy}
							/>
							<span>
								Resume saved session
								<small className="mono">{sessionPath}</small>
							</span>
						</label>
					)}
					{error && (
						<p className="dialog-error" role="alert">
							{error}
						</p>
					)}
					<div className="dialog-note">
						The desktop launches OMP directly without a shell. Existing CLI provider credentials and configuration
						are reused.
					</div>
					<footer>
						<button className="quiet-button" type="button" onClick={onClose} disabled={busy}>
							Cancel
						</button>
						<button className="primary-button" type="submit" disabled={busy || !cwd.trim()}>
							{busy ? <span className="activity-spinner" /> : <PlugZap size={14} />}
							{busy ? "Connecting…" : sessionPath && !restoreSession ? "Start fresh" : "Connect runtime"}
						</button>
					</footer>
				</form>
			</section>
		</div>
	);
}
