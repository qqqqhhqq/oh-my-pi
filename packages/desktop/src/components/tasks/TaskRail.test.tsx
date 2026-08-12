import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { initialDesktopState } from "../../state/desktop-state";
import { TaskRail } from "./TaskRail";

describe("task rail actions", () => {
	test("exposes search and does not render unsupported placeholder actions", () => {
		const html = renderToStaticMarkup(
			<TaskRail
				state={initialDesktopState}
				projects={[
					{ id: "project-desktop-agent-ui", title: "desktop-agent-ui", cwd: ".worktrees/desktop-agent-ui" },
					{ id: "project-coding-agent", title: "coding-agent", cwd: "packages/coding-agent" },
					{ id: "project-approval-flow", title: "approval-flow", cwd: ".worktrees/approval-flow" },
				]}
				runtime={{ status: "preview", stderr: [] }}
				rpcAvailable={false}
				onNewTask={() => {}}
				onQuickNewSession={() => {}}
				onSelectTask={() => {}}
				onArchiveTask={() => {}}
				onToggleFavorite={() => {}}
				onConnect={() => {}}
				onDisconnect={() => {}}
				onOpenSettings={() => {}}
			/>,
		);

		expect(html).toContain('aria-label="Search tasks"');
		expect(html).toContain('aria-label="Open settings"');
		expect(html).not.toContain("Scheduled");
		expect(html).not.toContain("Plugins");
	});
});
