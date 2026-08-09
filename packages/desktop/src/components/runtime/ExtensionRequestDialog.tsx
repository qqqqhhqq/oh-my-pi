import { Check, ChevronRight, ShieldQuestion, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { RpcExtensionUiResponse, RpcInteractiveUiRequest } from "../../rpc/rpc-session";

interface ExtensionRequestDialogProps {
	request: RpcInteractiveUiRequest;
	onResponse: (response: RpcExtensionUiResponse) => Promise<void>;
}

export function ExtensionRequestDialog({ request, onResponse }: ExtensionRequestDialogProps) {
	const [value, setValue] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();

	useEffect(() => {
		setValue(request.method === "editor" ? (request.prefill ?? "") : "");
		setError(undefined);
	}, [request]);

	async function respond(response: RpcExtensionUiResponse) {
		setBusy(true);
		setError(undefined);
		try {
			await onResponse(response);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	}

	async function submitValue(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		await respond({ type: "extension_ui_response", id: request.id, value });
	}

	return (
		<div className="dialog-backdrop" role="presentation">
			<section
				className="extension-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="extension-request-title"
			>
				<header>
					<div className="dialog-icon request-icon" aria-hidden="true">
						<ShieldQuestion size={18} />
					</div>
					<div>
						<small className="mono">OMP REQUEST</small>
						<h2 id="extension-request-title">{request.title}</h2>
					</div>
					<button
						className="icon-button"
						type="button"
						disabled={busy}
						onClick={() => void respond({ type: "extension_ui_response", id: request.id, cancelled: true })}
						aria-label="Cancel request"
					>
						<X size={16} />
					</button>
				</header>

				{request.method === "confirm" && (
					<div className="extension-request-body">
						<pre className="request-message mono">{request.message}</pre>
						{error && (
							<p className="dialog-error" role="alert">
								{error}
							</p>
						)}
						<footer>
							<button
								className="quiet-button danger-button"
								type="button"
								disabled={busy}
								onClick={() =>
									void respond({ type: "extension_ui_response", id: request.id, confirmed: false })
								}
							>
								<X size={14} /> Deny
							</button>
							<button
								className="primary-button approval-button"
								type="button"
								disabled={busy}
								onClick={() => void respond({ type: "extension_ui_response", id: request.id, confirmed: true })}
							>
								<Check size={14} /> Approve
							</button>
						</footer>
					</div>
				)}

				{request.method === "select" && (
					<div className="extension-request-body">
						<div className="request-options" role="listbox" aria-label={request.title}>
							{request.options.map(option => (
								<button
									className="request-option"
									type="button"
									role="option"
									aria-selected="false"
									disabled={busy}
									onClick={() =>
										void respond({ type: "extension_ui_response", id: request.id, value: option })
									}
									key={option}
								>
									<span>{option}</span>
									<ChevronRight size={14} />
								</button>
							))}
						</div>
						{error && (
							<p className="dialog-error" role="alert">
								{error}
							</p>
						)}
					</div>
				)}

				{(request.method === "input" || request.method === "editor") && (
					<form className="extension-request-body" onSubmit={submitValue}>
						{request.method === "editor" ? (
							<textarea
								value={value}
								onChange={event => setValue(event.target.value)}
								disabled={busy}
								rows={8}
								autoFocus
							/>
						) : (
							<input
								value={value}
								onChange={event => setValue(event.target.value)}
								disabled={busy}
								placeholder={request.placeholder}
								autoFocus
							/>
						)}
						{error && (
							<p className="dialog-error" role="alert">
								{error}
							</p>
						)}
						<footer>
							<button
								className="quiet-button"
								type="button"
								disabled={busy}
								onClick={() => void respond({ type: "extension_ui_response", id: request.id, cancelled: true })}
							>
								Cancel
							</button>
							<button className="primary-button" type="submit" disabled={busy || !value.trim()}>
								<Check size={14} /> Submit
							</button>
						</footer>
					</form>
				)}
			</section>
		</div>
	);
}
