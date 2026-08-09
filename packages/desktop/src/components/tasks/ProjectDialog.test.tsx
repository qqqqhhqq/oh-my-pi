import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectDialog } from "./ProjectDialog";

describe("project dialog", () => {
	test("collects a local project folder without creating a session", () => {
		const html = renderToStaticMarkup(<ProjectDialog open busy={false} onClose={() => {}} onCreate={() => {}} />);

		expect(html).toContain("Add local project");
		expect(html).toContain('name="title"');
		expect(html).toContain('name="cwd"');
		expect(html).toContain("Add project");
		expect(html).not.toContain("Create &amp; connect");
	});
});
