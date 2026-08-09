import { FolderGit2, FolderPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { DesktopProjectDraft } from "../../state/project-factory";

interface ProjectDialogProps {
	open: boolean;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onCreate: (draft: DesktopProjectDraft) => void;
}

export function ProjectDialog({ open, busy, error, onClose, onCreate }: ProjectDialogProps) {
	const [title, setTitle] = useState("");
	const [cwd, setCwd] = useState("");

	useEffect(() => {
		if (!open) return;
		setTitle("");
		setCwd("");
	}, [open]);

	if (!open) return null;

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onCreate({ title: title.trim(), cwd: cwd.trim() });
	}

	return (
		<div className="dialog-backdrop" role="presentation">
			<section
				className="connection-dialog task-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="new-project-title"
			>
				<header>
					<div className="dialog-icon" aria-hidden="true">
						<FolderPlus size={18} />
					</div>
					<div>
						<h2 id="new-project-title">Add local project</h2>
						<p>Register a folder locally, then create and keep its OMP sessions beneath it.</p>
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
						<span>Project name</span>
						<input
							name="title"
							value={title}
							onChange={event => setTitle(event.target.value)}
							disabled={busy}
							placeholder="Optional — derived from folder"
						/>
					</label>
					<label>
						<span>
							<FolderGit2 size={14} /> Local folder path
						</span>
						<input
							name="cwd"
							value={cwd}
							onChange={event => setCwd(event.target.value)}
							disabled={busy}
							required
							spellCheck={false}
							placeholder="C:\\workspace\\my-project"
						/>
					</label>
					{error && (
						<p className="dialog-error" role="alert">
							{error}
						</p>
					)}
					<footer>
						<button className="quiet-button" type="button" onClick={onClose} disabled={busy}>
							Cancel
						</button>
						<button className="primary-button" type="submit" disabled={busy || !cwd.trim()}>
							<FolderPlus size={14} /> Add project
						</button>
					</footer>
				</form>
			</section>
		</div>
	);
}
