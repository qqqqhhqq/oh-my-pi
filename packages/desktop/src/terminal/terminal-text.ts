export class TerminalTextDecoder {
	#decoder = new TextDecoder();

	push(bytes: Uint8Array): string {
		return this.#decoder.decode(bytes, { stream: true });
	}

	finish(): string {
		return this.#decoder.decode();
	}
}
