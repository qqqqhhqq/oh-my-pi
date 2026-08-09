import { Archive, Pencil, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { DesktopTask } from "../../state/desktop-state";

interface TaskActionDialogProps {
	task: DesktopTask;
	open: boolean;
	busy: boolean;
	error?: string;
	onClose: () => void;
	onRename: (title: string) => Promise<void>;
	onArchive: (archived: boolean) => Promise<void>;
	onDelete: () => Promise<void>;
}

export function TaskActionDialog({
	task,
	open,
	busy,
	error,
	onClose,
	onRename,
	onArchive,
	onDelete,
}: TaskActionDialogProps) {
	const [title, setTitle] = useState(task.title);
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		if (!open) return;
		setTitle(task.title);
		setConfirmDelete(false);
	}, [open, task]);

	if (!open) return null;

	async function rename(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await onRename(title.trim());
	}

	return (
		<div className="dialog-backdrop" role="presentation">
			<section
				className="connection-dialog task-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="manage-task-title"
			>
				<header>
					<div className="dialog-icon" aria-hidden="true">
						<Pencil size={17} />
					</div>
					<div>
						<h2 id="manage-task-title">Manage task</h2>
						<p className="mono">{task.cwd}</p>
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

				<form onSubmit={rename}>
					<label>
						<span>Task title</span>
						<input
							name="taskTitle"
							value={title}
							onChange={event => setTitle(event.target.value)}
							required
							disabled={busy}
						/>
					</label>
					<button
						className="quiet-button dialog-wide-action"
						type="submit"
						disabled={busy || !title.trim() || title.trim() === task.title}
					>
						<Pencil size={14} /> Rename task
					</button>
					<button
						className="quiet-button dialog-wide-action"
						type="button"
						disabled={busy}
						onClick={() => void onArchive(!task.archived)}
					>
						<Archive size={14} /> {task.archived ? "Unarchive task" : "Archive task"}
					</button>

					<div className="task-delete-zone" data-confirming={confirmDelete}>
						<p>Deleting this task never deletes the workspace or OMP session files.</p>
						{confirmDelete ? (
							<div className="delete-confirm-row">
								<button
									className="quiet-button"
									type="button"
									disabled={busy}
									onClick={() => setConfirmDelete(false)}
								>
									Cancel
								</button>
								<button
									className="quiet-button danger-button"
									type="button"
									disabled={busy}
									onClick={() => void onDelete()}
								>
									<Trash2 size={14} /> Confirm delete
								</button>
							</div>
						) : (
							<button
								className="quiet-button danger-button dialog-wide-action"
								type="button"
								disabled={busy}
								onClick={() => setConfirmDelete(true)}
							>
								<Trash2 size={14} /> Delete task…
							</button>
						)}
					</div>
					{error && (
						<p className="dialog-error" role="alert">
							{error}
						</p>
					)}
				</form>
			</section>
		</div>
	);
}
