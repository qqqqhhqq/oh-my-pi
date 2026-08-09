import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type Dispatch, useEffect, useMemo, useRef } from "react";
import type { DesktopAction } from "../state/desktop-state";
import { TerminalTextDecoder } from "./terminal-text";

interface TerminalOutputPayload {
	taskId: string;
	generation: number;
	data: number[];
}

interface TerminalExitPayload {
	taskId: string;
	generation: number;
	code: number | null;
}

interface ActiveTerminal {
	generation: number;
	decoder: TerminalTextDecoder;
}

interface PendingStop {
	generation: number;
	promise: Promise<void>;
	resolve: () => void;
}

export function useDesktopTerminal(dispatch: Dispatch<DesktopAction>) {
	const available = useMemo(() => isTauri(), []);
	const terminals = useRef(new Map<string, ActiveTerminal>());
	const pendingStops = useRef(new Map<string, PendingStop>());
	const nextGeneration = useRef(0);
	const writeQueues = useRef(new Map<string, Promise<void>>());

	useEffect(() => {
		if (!available) return;
		let disposed = false;
		let removeListeners: (() => void) | undefined;
		void Promise.all([
			listen<TerminalOutputPayload>("omp-terminal-output", event => {
				const active = terminals.current.get(event.payload.taskId);
				if (!active || active.generation !== event.payload.generation) return;
				const chunk = active.decoder.push(Uint8Array.from(event.payload.data));
				if (chunk) {
					dispatch({
						type: "terminal.output",
						taskId: event.payload.taskId,
						generation: event.payload.generation,
						chunk,
					});
				}
			}),
			listen<TerminalExitPayload>("omp-terminal-exit", event => {
				const active = terminals.current.get(event.payload.taskId);
				if (!active || active.generation !== event.payload.generation) return;
				const chunk = active.decoder.finish();
				if (chunk) {
					dispatch({
						type: "terminal.output",
						taskId: event.payload.taskId,
						generation: event.payload.generation,
						chunk,
					});
				}
				terminals.current.delete(event.payload.taskId);
				dispatch({
					type: "terminal.exited",
					taskId: event.payload.taskId,
					generation: event.payload.generation,
					code: event.payload.code,
				});
				const pending = pendingStops.current.get(event.payload.taskId);
				if (pending?.generation === event.payload.generation) {
					pendingStops.current.delete(event.payload.taskId);
					pending.resolve();
				}
			}),
		]).then(listeners => {
			const remove = () => {
				for (const listener of listeners) listener();
			};
			if (disposed) remove();
			else removeListeners = remove;
		});
		return () => {
			disposed = true;
			removeListeners?.();
		};
	}, [available, dispatch]);

	async function start(taskId: string, cwd: string, rows: number, cols: number): Promise<void> {
		if (!available) throw new Error("Interactive terminals are available only in the desktop runtime");
		const generation = ++nextGeneration.current;
		dispatch({ type: "terminal.starting", taskId, generation });
		terminals.current.set(taskId, { generation, decoder: new TerminalTextDecoder() });
		try {
			await invoke("start_terminal", { taskId, generation, cwd, rows, cols });
			if (terminals.current.get(taskId)?.generation === generation) {
				dispatch({ type: "terminal.started", taskId, generation });
			}
		} catch (error) {
			if (terminals.current.get(taskId)?.generation === generation) {
				terminals.current.delete(taskId);
				dispatch({
					type: "terminal.failed",
					taskId,
					generation,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			throw error;
		}
	}

	async function writeBytes(taskId: string, data: Uint8Array): Promise<void> {
		if (!available) throw new Error("Interactive terminals are available only in the desktop runtime");
		const generation = terminals.current.get(taskId)?.generation;
		if (generation === undefined) throw new Error("Terminal is not running for this task");
		const previous = writeQueues.current.get(taskId) ?? Promise.resolve();
		const next = previous
			.catch(() => {})
			.then(async () => {
				await invoke<void>("write_terminal", { taskId, generation, data: Array.from(data) });
			});
		writeQueues.current.set(taskId, next);
		try {
			await next;
		} finally {
			if (writeQueues.current.get(taskId) === next) writeQueues.current.delete(taskId);
		}
	}

	async function write(taskId: string, data: string): Promise<void> {
		await writeBytes(taskId, new TextEncoder().encode(data));
	}

	async function writeBinary(taskId: string, data: string): Promise<void> {
		await writeBytes(
			taskId,
			Uint8Array.from(data, character => character.charCodeAt(0) & 0xff),
		);
	}

	async function interrupt(taskId: string): Promise<void> {
		await writeBytes(taskId, Uint8Array.of(3));
	}

	async function resize(taskId: string, rows: number, cols: number): Promise<void> {
		if (!available) return;
		const generation = terminals.current.get(taskId)?.generation;
		if (generation === undefined) return;
		await invoke("resize_terminal", { taskId, generation, rows, cols });
	}

	async function stop(taskId: string): Promise<void> {
		if (!available) return;
		const active = terminals.current.get(taskId);
		if (!active) return;
		const { generation } = active;
		const existing = pendingStops.current.get(taskId);
		if (existing?.generation === generation) {
			await existing.promise;
			return;
		}
		const deferred = Promise.withResolvers<void>();
		pendingStops.current.set(taskId, { generation, ...deferred });
		dispatch({ type: "terminal.stopping", taskId, generation });
		try {
			await writeQueues.current.get(taskId)?.catch(() => {});
			await invoke("stop_terminal", { taskId, generation });
			await deferred.promise;
		} catch (error) {
			if (pendingStops.current.get(taskId)?.generation === generation) {
				pendingStops.current.delete(taskId);
			}
			dispatch({
				type: "terminal.stop_failed",
				taskId,
				generation,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	return { available, start, write, writeBinary, interrupt, resize, stop };
}
