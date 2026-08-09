import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtensionRequestDialog } from "./ExtensionRequestDialog";

describe("ExtensionRequestDialog", () => {
	test("renders confirmation details with explicit allow and deny actions", () => {
		const html = renderToStaticMarkup(
			<ExtensionRequestDialog
				request={{
					type: "extension_ui_request",
					id: "approval-1",
					method: "confirm",
					title: "Run command?",
					message: "git status --short",
				}}
				onResponse={() => Promise.resolve()}
			/>,
		);

		expect(html).toContain("Run command?");
		expect(html).toContain("git status --short");
		expect(html).toContain("Deny");
		expect(html).toContain("Approve");
	});

	test("renders every option from a select request", () => {
		const html = renderToStaticMarkup(
			<ExtensionRequestDialog
				request={{
					type: "extension_ui_request",
					id: "select-1",
					method: "select",
					title: "Choose a model",
					options: ["GLM-5.2", "GPT-5.2"],
				}}
				onResponse={() => Promise.resolve()}
			/>,
		);

		expect(html).toContain("GLM-5.2");
		expect(html).toContain("GPT-5.2");
	});
});
