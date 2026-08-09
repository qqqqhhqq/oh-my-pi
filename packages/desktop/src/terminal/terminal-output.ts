export interface TerminalOutputWindow {
	output: string;
	outputOffset: number;
}

export interface TerminalOutputDelta {
	reset: boolean;
	data: string;
}

const TERMINAL_OUTPUT_LIMIT = 200_000;

export function appendTerminalOutput(
	current: TerminalOutputWindow,
	chunk: string,
	limit = TERMINAL_OUTPUT_LIMIT,
): TerminalOutputWindow {
	const combined = `${current.output}${chunk}`;
	const removed = Math.max(0, combined.length - limit);
	return {
		output: removed > 0 ? combined.slice(removed) : combined,
		outputOffset: current.outputOffset + removed,
	};
}

export function terminalOutputDelta(
	previous: TerminalOutputWindow,
	current: TerminalOutputWindow,
): TerminalOutputDelta {
	const previousEnd = previous.outputOffset + previous.output.length;
	const currentEnd = current.outputOffset + current.output.length;
	if (previousEnd >= current.outputOffset && previousEnd <= currentEnd) {
		return { reset: false, data: current.output.slice(previousEnd - current.outputOffset) };
	}
	return { reset: true, data: current.output };
}
