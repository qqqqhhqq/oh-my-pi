import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	discardRpcGitChanges,
	getRpcGitDiff,
	getRpcGitSnapshot,
	stageRpcGitChanges,
} from "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-git";
import { $ } from "bun";

describe("RPC Git bridge", () => {
	let directory = "";

	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "omp-rpc-git-"));
		await $`git init -q -b main`.cwd(directory);
		await $`git config user.email desktop@example.test`.cwd(directory);
		await $`git config user.name Desktop Test`.cwd(directory);
		await Bun.write(path.join(directory, "tracked.txt"), "before\n");
		await $`git add tracked.txt`.cwd(directory);
		await $`git commit -q -m initial`.cwd(directory);
	});

	afterEach(async () => {
		if (directory) await fs.rm(directory, { force: true, recursive: true });
	});

	test("returns branch, lossless paths, and combined diff counts", async () => {
		await Bun.write(path.join(directory, "tracked.txt"), "after\nextra\n");
		await Bun.write(path.join(directory, "scratch file.txt"), "untracked\n");

		const snapshot = await getRpcGitSnapshot(directory);

		expect(snapshot.branch).toBe("main");
		expect(snapshot.repoRoot).toBe(directory.replaceAll("\\", "/"));
		expect(snapshot.entries).toEqual([
			{
				path: "scratch file.txt",
				indexStatus: "?",
				worktreeStatus: "?",
				kind: "untracked",
				additions: 0,
				deletions: 0,
			},
			{
				path: "tracked.txt",
				indexStatus: " ",
				worktreeStatus: "M",
				kind: "modified",
				additions: 2,
				deletions: 1,
			},
		]);
	});

	test("stages and discards only current exact change paths", async () => {
		await Bun.write(path.join(directory, "tracked.txt"), "after\n");
		await Bun.write(path.join(directory, "scratch file.txt"), "untracked\n");

		const staged = await stageRpcGitChanges(directory, ["tracked.txt"]);
		expect(staged.entries.find(entry => entry.path === "tracked.txt")?.indexStatus).toBe("M");

		const discarded = await discardRpcGitChanges(directory, ["tracked.txt", "scratch file.txt"]);
		expect(discarded.entries).toEqual([]);
		expect((await Bun.file(path.join(directory, "tracked.txt")).text()).replaceAll("\r\n", "\n")).toBe("before\n");
		expect(await Bun.file(path.join(directory, "scratch file.txt")).exists()).toBe(false);
	});

	test("stages every tracked and untracked change when paths are omitted", async () => {
		await Bun.write(path.join(directory, "tracked.txt"), "after\n");
		await Bun.write(path.join(directory, "scratch file.txt"), "untracked\n");

		const staged = await stageRpcGitChanges(directory);

		expect(staged.entries).toEqual([
			{
				path: "scratch file.txt",
				indexStatus: "A",
				worktreeStatus: " ",
				kind: "added",
				additions: 1,
				deletions: 0,
			},
			{
				path: "tracked.txt",
				indexStatus: "M",
				worktreeStatus: " ",
				kind: "modified",
				additions: 1,
				deletions: 1,
			},
		]);
	});

	test("resolves repository-relative paths when the RPC cwd is nested", async () => {
		const nested = path.join(directory, "packages", "desktop");
		await fs.mkdir(nested, { recursive: true });
		await Bun.write(path.join(directory, "tracked.txt"), "after\n");

		const staged = await stageRpcGitChanges(nested, ["tracked.txt"]);

		expect(staged.repoRoot).toBe(directory.replaceAll("\\", "/"));
		expect(staged.entries).toEqual([
			{
				path: "tracked.txt",
				indexStatus: "M",
				worktreeStatus: " ",
				kind: "modified",
				additions: 1,
				deletions: 1,
			},
		]);
	});

	test("returns a reviewable diff for an exact untracked path", async () => {
		await Bun.write(path.join(directory, "scratch file.txt"), "untracked\n");

		const diff = await getRpcGitDiff(directory, "scratch file.txt");

		expect(diff).toContain("scratch file.txt");
		expect(diff).toContain("+untracked");
	});

	test("returns a reviewable diff for an untracked path beginning with a dash", async () => {
		await Bun.write(path.join(directory, "-scratch.txt"), "untracked\n");

		const diff = await getRpcGitDiff(directory, "-scratch.txt");

		expect(diff).toContain("-scratch.txt");
		expect(diff).toContain("+untracked");
	});

	test("rejects paths that are not in the current status snapshot", async () => {
		await expect(discardRpcGitChanges(directory, ["../outside.txt"])).rejects.toThrow(
			"Path is not a current Git change: ../outside.txt",
		);
	});

	test.skipIf(process.platform === "win32")("treats Git pathspec magic in filenames as literal data", async () => {
		const magicPath = ":(glob)**";
		await Bun.write(path.join(directory, magicPath), "literal\n");

		const staged = await stageRpcGitChanges(directory, [magicPath]);
		expect(staged.entries.find(entry => entry.path === magicPath)?.indexStatus).toBe("A");

		const discarded = await discardRpcGitChanges(directory, [magicPath]);
		expect(discarded.entries).toEqual([]);
		expect(await Bun.file(path.join(directory, magicPath)).exists()).toBe(false);
	});
});
