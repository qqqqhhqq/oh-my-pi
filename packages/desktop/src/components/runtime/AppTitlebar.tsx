import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, X } from "lucide-react";

interface AppTitlebarProps {
	native: boolean;
}

async function minimizeWindow(): Promise<void> {
	await getCurrentWindow().minimize();
}

async function toggleMaximizeWindow(): Promise<void> {
	await getCurrentWindow().toggleMaximize();
}

async function closeWindow(): Promise<void> {
	await getCurrentWindow().close();
}

function runWindowOperation(operation: () => Promise<void>): void {
	void operation().catch(() => {});
}

export function AppTitlebar({ native }: AppTitlebarProps) {
	if (!native) return null;
	return (
		<header className="app-titlebar" data-tauri-drag-region>
			<div className="app-titlebar-brand" data-tauri-drag-region>
				<span className="mono">π</span> OMP Desktop
			</div>
			<div className="app-titlebar-spacer" data-tauri-drag-region />
			<div className="app-titlebar-controls">
				<button type="button" aria-label="Minimize window" onClick={() => runWindowOperation(minimizeWindow)}>
					<Minus size={15} />
				</button>
				<button type="button" aria-label="Maximize window" onClick={() => runWindowOperation(toggleMaximizeWindow)}>
					<Maximize2 size={13} />
				</button>
				<button type="button" aria-label="Close window" onClick={() => runWindowOperation(closeWindow)}>
					<X size={15} />
				</button>
			</div>
		</header>
	);
}
