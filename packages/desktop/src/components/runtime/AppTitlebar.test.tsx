import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppTitlebar } from "./AppTitlebar";

describe("desktop titlebar", () => {
	test("renders draggable branding and accessible window controls in the native shell", () => {
		const html = renderToStaticMarkup(<AppTitlebar native />);

		expect(html).toContain('data-tauri-drag-region="true"');
		expect(html).toContain('aria-label="Minimize window"');
		expect(html).toContain('aria-label="Maximize window"');
		expect(html).toContain('aria-label="Close window"');
	});

	test("does not render native window controls in browser preview", () => {
		const html = renderToStaticMarkup(<AppTitlebar native={false} />);

		expect(html).not.toContain("Minimize window");
	});
});
