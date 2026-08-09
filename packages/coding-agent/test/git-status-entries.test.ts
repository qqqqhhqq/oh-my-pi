import { describe, expect, test } from "bun:test";
import { status } from "@oh-my-pi/pi-coding-agent/utils/git";

describe("git status entries", () => {
	test("parses NUL-delimited paths without losing spaces or rename metadata", () => {
		const raw = [
			" M src/file one.ts",
			"R  src/new name.ts",
			"src/old name.ts",
			"?? scratch file.ts",
			"UU conflicted.ts",
			"DD both-deleted.ts",
			"",
		].join("\0");

		expect(status.parseEntries(raw)).toEqual([
			{
				path: "src/file one.ts",
				indexStatus: " ",
				worktreeStatus: "M",
				kind: "modified",
			},
			{
				path: "src/new name.ts",
				originalPath: "src/old name.ts",
				indexStatus: "R",
				worktreeStatus: " ",
				kind: "renamed",
			},
			{
				path: "scratch file.ts",
				indexStatus: "?",
				worktreeStatus: "?",
				kind: "untracked",
			},
			{
				path: "conflicted.ts",
				indexStatus: "U",
				worktreeStatus: "U",
				kind: "conflicted",
			},
			{
				path: "both-deleted.ts",
				indexStatus: "D",
				worktreeStatus: "D",
				kind: "conflicted",
			},
		]);
	});

	test("returns no entries for a clean worktree", () => {
		expect(status.parseEntries("")).toEqual([]);
	});
});
