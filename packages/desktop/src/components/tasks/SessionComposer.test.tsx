import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildSessionComposerDraft,
	SessionComposer,
	thinkingSliderIndex,
	thinkingSliderLevel,
} from "./SessionComposer";

describe("thinking slider mapping", () => {
	test("maps every slider position to a thinking level and back", () => {
		expect(thinkingSliderLevel(0)).toBe("off");
		expect(thinkingSliderLevel(3)).toBe("medium");
		expect(thinkingSliderLevel(6)).toBe("max");
		expect(thinkingSliderLevel(99)).toBe("max");
		expect(thinkingSliderLevel(-1)).toBe("off");

		expect(thinkingSliderIndex("off")).toBe(0);
		expect(thinkingSliderIndex("max")).toBe(6);
		expect(thinkingSliderIndex("auto")).toBe(4);
	});
});

describe("session composer", () => {
	test("keeps selected model and provider in the task draft", () => {
		expect(
			buildSessionComposerDraft({
				projectId: "project-1",
				approvalMode: "write",
				thinking: "high",
				prompt: "Inspect the repository",
				provider: "openai",
				model: "gpt-5.2-codex",
			}),
		).toEqual({
			projectId: "project-1",
			approvalMode: "write",
			thinking: "high",
			prompt: "Inspect the repository",
			provider: "openai",
			model: "gpt-5.2-codex",
		});
	});

	test("renders a Codex-style main workspace composer", () => {
		const html = renderToStaticMarkup(
			<SessionComposer
				projects={[{ id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" }]}
				busy={false}
				onCreate={async () => {}}
				onOpenProject={() => {}}
			/>,
		);

		expect(html).toContain('class="session-composer-stage"');
		expect(html).toContain("What should OMP work on?");
		expect(html).toContain('class="session-composer-card"');
		expect(html).toContain('class="session-context-trigger"');
		expect(html).toContain("oh-my-pi");
		expect(html).toContain("C:/workspace/oh-my-pi");
		expect(html).toContain('name="prompt"');
		expect(html).toContain('class="session-runtime-trigger"');
		expect(html).toContain("CLI default");
		expect(html).toContain("auto");
		expect(html).toContain("可编辑");
		expect(html).toContain("编辑操作自动放行");
		expect(html).toContain("Send task");
		expect(html).not.toContain("Cancel");
		expect(html).not.toContain('class="session-composer-cancel"');
	});

	test("shows context usage and prompt estimate when available", () => {
		const html = renderToStaticMarkup(
			<SessionComposer
				projects={[{ id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" }]}
				busy={false}
				onCreate={async () => {}}
				onOpenProject={() => {}}
				context={{ percent: 42, tokens: 84_000, contextWindow: 200_000, modelCost: 3 }}
			/>,
		);

		expect(html).toContain("42%");
		expect(html).toContain("84.0k/200.0k");
		expect(html).toContain('class="session-status-context');
	});

	test("keeps the send action available while the backend starts", () => {
		const html = renderToStaticMarkup(
			<SessionComposer
				projects={[{ id: "project-1", title: "oh-my-pi", cwd: "C:/workspace/oh-my-pi" }]}
				busy
				onCreate={async () => {}}
				onOpenProject={() => {}}
			/>,
		);

		expect(html).toContain("Send task");
		expect(html).toContain('class="activity-spinner"');
	});
});
