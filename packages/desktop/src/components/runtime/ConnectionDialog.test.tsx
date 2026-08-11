import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionDialog } from "./ConnectionDialog";

describe("OMP connection dialog", () => {
	test("defaults a failed saved-session restore to an explicit fresh start", () => {
		const html = renderToStaticMarkup(
			<ConnectionDialog
				open
				runtimeInfo={{ available: true, defaultWorkspace: "C:/workspace" }}
				initialConfig={{ cwd: "C:/workspace" }}
				sessionPath="C:/sessions/stale.jsonl"
				restoreFailed
				busy={false}
				onClose={() => {}}
				onConnect={async () => {}}
			/>,
		);

		expect(html).toContain("Resume saved session");
		expect(html).toContain("C:/sessions/stale.jsonl");
		expect(html).toContain("Start fresh");
		expect(html).not.toContain('checked=""');
	});

	test("keeps a session inside its registered project folder", () => {
		const html = renderToStaticMarkup(
			<ConnectionDialog
				open
				runtimeInfo={{ available: true, defaultWorkspace: "C:/workspace/oh-my-pi" }}
				initialConfig={{ cwd: "C:/workspace/oh-my-pi" }}
				workspaceReadOnly
				busy={false}
				onClose={() => {}}
				onConnect={async () => {}}
			/>,
		);

		expect(html).toContain("Project folder");
		expect(html).toContain("readOnly");
	});
});
