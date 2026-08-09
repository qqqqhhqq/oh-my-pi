import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DesktopTask } from "../../state/desktop-state";
import { TaskActionDialog } from "./TaskActionDialog";

const task = {
	id: "task-1",
	title: "Review Git changes",
	cwd: "C:/workspace/oh-my-pi",
	archived: false,
} as DesktopTask;

describe("task action dialog", () => {
	test("offers rename, archive, and an explicit delete confirmation boundary", () => {
		const html = renderToStaticMarkup(
			<TaskActionDialog
				task={task}
				open
				busy={false}
				onClose={() => {}}
				onRename={async () => {}}
				onArchive={async () => {}}
				onDelete={async () => {}}
			/>,
		);

		expect(html).toContain("Manage task");
		expect(html).toContain('name="taskTitle"');
		expect(html).toContain("Archive task");
		expect(html).toContain("Delete task…");
		expect(html).toContain("Deleting this task never deletes the workspace");
	});
});
