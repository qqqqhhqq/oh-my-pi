import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionComposer } from "./SessionComposer";

describe("session composer", () => {
	test("renders a Codex-style main workspace composer", () => {
		const html = renderToStaticMarkup(
			<SessionComposer
				runtimeInfo={{ available: true, defaultWorkspace: "C:/workspace/oh-my-pi", defaultExecutable: "omp" }}
				projects={[{ id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" }]}
				busy={false}
				onCancel={() => {}}
				onCreate={async () => {}}
			/>,
		);

		expect(html).toContain('class="session-composer-stage"');
		expect(html).toContain("What should OMP work on?");
		expect(html).toContain('class="session-composer-card"');
		expect(html).toContain('name="projectId"');
		expect(html).toContain("C:/workspace/oh-my-pi");
		expect(html).toContain('name="prompt"');
		expect(html).toContain("Runtime settings");
		expect(html).not.toContain("session-composer-settings");
		expect(html).not.toContain("First instruction");
		expect(html).toContain("Send task");
		expect(html).toContain("Cancel");
	});

	test("keeps cancellation available while the backend starts", () => {
		const html = renderToStaticMarkup(
			<SessionComposer
				runtimeInfo={{ available: true, defaultWorkspace: "C:/workspace/oh-my-pi", defaultExecutable: "omp" }}
				projects={[{ id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" }]}
				busy
				onCancel={() => {}}
				onCreate={async () => {}}
			/>,
		);

		expect(html).toContain('class="session-composer-cancel"');
		expect(html).not.toContain('class="session-composer-cancel" disabled=""');
	});
});
