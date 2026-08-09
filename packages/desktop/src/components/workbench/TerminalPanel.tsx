import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { CircleStop, Play, RotateCcw, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DesktopTerminalRuntime } from "../../state/desktop-state";
import { type TerminalOutputWindow, terminalOutputDelta } from "../../terminal/terminal-output";

interface TerminalPanelProps {
	available: boolean;
	terminal: DesktopTerminalRuntime;
	cwd: string;
	onStart: (rows: number, cols: number) => Promise<void>;
	onWrite: (data: string) => Promise<void>;
	onWriteBinary: (data: string) => Promise<void>;
	onInterrupt: () => Promise<void>;
	onResize: (rows: number, cols: number) => Promise<void>;
	onStop: () => Promise<void>;
}

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 100;

export function TerminalPanel({
	available,
	terminal,
	cwd,
	onStart,
	onWrite,
	onWriteBinary,
	onInterrupt,
	onResize,
	onStop,
}: TerminalPanelProps) {
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string>();
	const hostRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | undefined>(undefined);
	const fitAddonRef = useRef<FitAddon | undefined>(undefined);
	const renderedGenerationRef = useRef<number | undefined>(undefined);
	const renderedOutputRef = useRef<TerminalOutputWindow>({ output: "", outputOffset: 0 });
	const lastReportedSizeRef = useRef("");
	const runningRef = useRef(false);
	const onWriteRef = useRef(onWrite);
	const onWriteBinaryRef = useRef(onWriteBinary);
	const onResizeRef = useRef(onResize);
	const running = terminal.status === "running";
	const emulatorActive =
		terminal.status === "starting" ||
		terminal.status === "running" ||
		terminal.status === "stopping" ||
		terminal.status === "exited";
	runningRef.current = running;
	onWriteRef.current = onWrite;
	onWriteBinaryRef.current = onWriteBinary;
	onResizeRef.current = onResize;

	function reportError(error: unknown): void {
		setActionError(error instanceof Error ? error.message : String(error));
	}

	useEffect(() => {
		const host = hostRef.current;
		if (!emulatorActive || !host) return;

		const instance = new XTerm({
			cursorBlink: true,
			cursorStyle: "block",
			fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
			fontSize: 12,
			lineHeight: 1.2,
			scrollback: 5_000,
			theme: {
				background: "#161616",
				foreground: "#a6abb5",
				cursor: "#0088fa",
				cursorAccent: "#161616",
				selectionBackground: "#0088fa55",
				black: "#161616",
				red: "#fc3a4b",
				green: "#89d281",
				yellow: "#febc38",
				blue: "#0088fa",
				magenta: "#a789ff",
				cyan: "#00b8ff",
				white: "#d7dbe2",
				brightBlack: "#6e7480",
				brightRed: "#ff6472",
				brightGreen: "#a5e49e",
				brightYellow: "#ffd27a",
				brightBlue: "#4ab2ff",
				brightMagenta: "#c7aaff",
				brightCyan: "#69d8ff",
				brightWhite: "#ffffff",
			},
		});
		const fitAddon = new FitAddon();
		instance.loadAddon(fitAddon);
		instance.open(host);
		xtermRef.current = instance;
		fitAddonRef.current = fitAddon;
		renderedGenerationRef.current = terminal.generation;
		renderedOutputRef.current = { output: terminal.output, outputOffset: terminal.outputOffset };
		if (terminal.output) instance.write(terminal.output);

		const dataSubscription = instance.onData(data => {
			void onWriteRef.current(data).catch(reportError);
		});
		const binarySubscription = instance.onBinary(data => {
			void onWriteBinaryRef.current(data).catch(reportError);
		});
		const fit = () => {
			const dimensions = fitAddon.proposeDimensions();
			if (!dimensions || dimensions.rows < 1 || dimensions.cols < 1) return;
			if (instance.rows !== dimensions.rows || instance.cols !== dimensions.cols) {
				instance.resize(dimensions.cols, dimensions.rows);
			}
			const sizeKey = `${dimensions.rows}x${dimensions.cols}`;
			if (runningRef.current && lastReportedSizeRef.current !== sizeKey) {
				lastReportedSizeRef.current = sizeKey;
				void onResizeRef.current(dimensions.rows, dimensions.cols).catch(reportError);
			}
		};
		const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fit);
		observer?.observe(host);
		queueMicrotask(() => {
			fit();
			instance.focus();
		});

		return () => {
			observer?.disconnect();
			dataSubscription.dispose();
			binarySubscription.dispose();
			fitAddon.dispose();
			instance.dispose();
			xtermRef.current = undefined;
			fitAddonRef.current = undefined;
			renderedGenerationRef.current = undefined;
			renderedOutputRef.current = { output: "", outputOffset: 0 };
			lastReportedSizeRef.current = "";
		};
	}, [emulatorActive]);

	useEffect(() => {
		const instance = xtermRef.current;
		if (!instance) return;
		const current = { output: terminal.output, outputOffset: terminal.outputOffset };
		if (renderedGenerationRef.current !== terminal.generation) {
			instance.reset();
			if (current.output) instance.write(current.output);
		} else {
			const delta = terminalOutputDelta(renderedOutputRef.current, current);
			if (delta.reset) instance.reset();
			if (delta.data) instance.write(delta.data);
		}
		renderedGenerationRef.current = terminal.generation;
		renderedOutputRef.current = current;
	}, [terminal.generation, terminal.output, terminal.outputOffset]);

	useEffect(() => {
		if (!running) return;
		const dimensions = fitAddonRef.current?.proposeDimensions();
		if (!dimensions || dimensions.rows < 1 || dimensions.cols < 1) return;
		const sizeKey = `${dimensions.rows}x${dimensions.cols}`;
		if (lastReportedSizeRef.current === sizeKey) return;
		lastReportedSizeRef.current = sizeKey;
		void onResizeRef.current(dimensions.rows, dimensions.cols).catch(reportError);
	}, [running]);

	async function run(operation: () => Promise<void>) {
		setBusy(true);
		setActionError(undefined);
		try {
			await operation();
		} catch (error) {
			reportError(error);
		} finally {
			setBusy(false);
		}
	}

	async function restart() {
		const rows = xtermRef.current?.rows ?? DEFAULT_ROWS;
		const cols = xtermRef.current?.cols ?? DEFAULT_COLS;
		await onStop();
		await onStart(rows, cols);
	}

	if (!emulatorActive) {
		return (
			<div className="terminal-empty-state">
				<TerminalSquare size={25} />
				<strong>{terminal.status === "error" ? "Terminal failed" : "Interactive workspace terminal"}</strong>
				<p className="mono">{terminal.error ?? cwd}</p>
				<button
					className="primary-button"
					type="button"
					disabled={!available || busy}
					onClick={() => void run(() => onStart(DEFAULT_ROWS, DEFAULT_COLS))}
				>
					<Play size={13} /> Start terminal
				</button>
				{!available && <small>Available in the desktop runtime</small>}
			</div>
		);
	}

	return (
		<div className="terminal-view">
			<div className="terminal-toolbar">
				<span>
					<span className="terminal-dot" data-running={running} />
					{terminal.status === "starting"
						? "Starting shell"
						: terminal.status === "stopping"
							? "Stopping shell"
							: running
								? "Interactive PTY · xterm"
								: `Exited ${terminal.exitCode ?? ""}`}
				</span>
				<div className="terminal-actions">
					{running && (
						<>
							<button
								className="icon-button terminal-interrupt"
								type="button"
								disabled={busy}
								onClick={() => void run(onInterrupt)}
								aria-label="Interrupt terminal"
							>
								<span className="mono">^C</span>
							</button>
							<button
								className="icon-button"
								type="button"
								disabled={busy}
								onClick={() => void run(onStop)}
								aria-label="Stop terminal"
							>
								<CircleStop size={15} />
							</button>
						</>
					)}
					<button
						className="quiet-button"
						type="button"
						disabled={busy || terminal.status === "starting" || terminal.status === "stopping"}
						onClick={() => void run(restart)}
					>
						<RotateCcw size={13} /> Restart
					</button>
				</div>
			</div>
			<div className="terminal-emulator-shell">
				<div
					className="terminal-emulator"
					ref={hostRef}
					role="application"
					aria-label="Interactive terminal"
					data-terminal-emulator="xterm"
				/>
				{terminal.status === "starting" && <span className="terminal-starting">Starting native shell…</span>}
			</div>
			{(actionError || terminal.error) && <div className="terminal-error">{actionError ?? terminal.error}</div>}
		</div>
	);
}
