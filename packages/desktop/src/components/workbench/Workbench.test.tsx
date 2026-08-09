import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DesktopGitRuntime, DesktopTask } from "../../state/desktop-state";
import { Workbench } from "./Workbench";

const task: DesktopTask = {
	id: "task-1",
	projectId: "project-1",
	workspaceId: "oh-my-pi",
	title: "Review Git changes",
	status: "waiting",
	mode: "direct",
	model: "gpt-5.2-codex",
	thinking: "high",
	cwd: "C:/workspace/oh-my-pi",
	branch: "main",
	elapsed: "—",
	contextPercent: 0,
	additions: 4,
	deletions: 1,
	agentCount: 0,
	archived: false,
	lastOpenedAt: 1,
	launchConfig: { cwd: "C:/workspace/oh-my-pi" },
};

const git: DesktopGitRuntime = {
	status: "ready",
	selectedPath: "src/app.ts",
	diff: "diff --git a/src/app.ts b/src/app.ts\n-old\n+new",
	snapshot: {
		repoRoot: "C:/workspace/oh-my-pi",
		branch: "main",
		entries: [
			{
				path: "src/app.ts",
				indexStatus: " ",
				worktreeStatus: "M",
				kind: "modified",
				additions: 4,
				deletions: 1,
			},
			{
				path: "scratch file.ts",
				indexStatus: "?",
				worktreeStatus: "?",
				kind: "untracked",
				additions: 0,
				deletions: 0,
			},
		],
	},
};

describe("Git changes workbench", () => {
	test("renders the live snapshot, selected diff, and explicit review actions", () => {
		const html = renderToStaticMarkup(
			<Workbench
				task={task}
				activeTab="changes"
				onSelectTab={() => {}}
				runtime={{ status: "connected", stderr: [] }}
				agents={[]}
				git={git}
				onRefreshGit={async () => {}}
				onSelectGitPath={async () => {}}
				onStageGitChanges={async () => {}}
				onDiscardGitChanges={async () => {}}
				onOpenEditor={async () => {}}
				terminalAvailable
				terminal={{ status: "offline", output: "", outputOffset: 0 }}
				onStartTerminal={async () => {}}
				onWriteTerminal={async () => {}}
				onWriteTerminalBinary={async () => {}}
				onInterruptTerminal={async () => {}}
				onResizeTerminal={async () => {}}
				onStopTerminal={async () => {}}
			/>,
		);

		expect(html).toContain("src/app.ts");
		expect(html).toContain('class="file-status file-status-modified"');
		expect(html).toContain('class="file-status file-status-untracked"');
		expect(html).toContain("diff --git a/src/app.ts b/src/app.ts");
		expect(html).toContain("Stage all");
		expect(html).toContain("Discard src/app.ts");
		expect(html).not.toContain("Git change snapshots are not loaded yet");
	});
});
