import type { GitStatusEntry, GitStatusEntryKind } from "../../utils/git";
import * as git from "../../utils/git";

export interface RpcGitChange {
	path: string;
	originalPath?: string;
	indexStatus: string;
	worktreeStatus: string;
	kind: GitStatusEntryKind;
	additions: number;
	deletions: number;
}

export interface RpcGitSnapshot {
	repoRoot: string;
	branch: string;
	entries: RpcGitChange[];
}

function uiPath(value: string): string {
	return value.replaceAll("\\", "/");
}

async function requireRepoRoot(cwd: string): Promise<string> {
	const repoRoot = await git.repo.root(cwd);
	if (!repoRoot) throw new Error(`Not a Git repository: ${cwd}`);
	return repoRoot;
}

function addCounts(
	counts: Map<string, { additions: number; deletions: number }>,
	entries: readonly { path: string; additions: number; deletions: number }[],
): void {
	for (const entry of entries) {
		const current = counts.get(entry.path) ?? { additions: 0, deletions: 0 };
		counts.set(entry.path, {
			additions: current.additions + entry.additions,
			deletions: current.deletions + entry.deletions,
		});
	}
}

export async function getRpcGitSnapshot(cwd: string): Promise<RpcGitSnapshot> {
	const repoRoot = await requireRepoRoot(cwd);
	const [head, entries, unstaged, staged] = await Promise.all([
		git.head.resolve(repoRoot),
		git.status.entries(repoRoot),
		git.diff.numstat(repoRoot),
		git.diff.numstat(repoRoot, { cached: true }),
	]);
	const counts = new Map<string, { additions: number; deletions: number }>();
	addCounts(counts, unstaged);
	addCounts(counts, staged);

	return {
		repoRoot: uiPath(repoRoot),
		branch: head?.kind === "ref" ? (head.branchName ?? "HEAD") : "detached HEAD",
		entries: entries
			.map(entry => ({
				...entry,
				...(counts.get(entry.path) ?? { additions: 0, deletions: 0 }),
			}))
			.sort((left, right) => left.path.localeCompare(right.path)),
	};
}

function selectCurrentEntries(entries: readonly GitStatusEntry[], paths: readonly string[]): GitStatusEntry[] {
	if (paths.length === 0) throw new Error("At least one current Git change path is required");
	const byPath = new Map(entries.map(entry => [entry.path, entry]));
	return paths.map(changedPath => {
		const entry = byPath.get(changedPath);
		if (!entry) throw new Error(`Path is not a current Git change: ${changedPath}`);
		return entry;
	});
}

export async function stageRpcGitChanges(cwd: string, paths: readonly string[] = []): Promise<RpcGitSnapshot> {
	const repoRoot = await requireRepoRoot(cwd);
	if (paths.length > 0) selectCurrentEntries(await git.status.entries(repoRoot), paths);
	await git.stage.files(repoRoot, paths, undefined, { literalPathspecs: paths.length > 0 });
	return getRpcGitSnapshot(repoRoot);
}

export async function getRpcGitDiff(cwd: string, changedPath: string): Promise<string> {
	const repoRoot = await requireRepoRoot(cwd);
	const [entry] = selectCurrentEntries(await git.status.entries(repoRoot), [changedPath]);
	if (entry?.kind === "untracked") {
		return git.diff(repoRoot, {
			allowFailure: true,
			literalPathspecs: true,
			noIndex: { left: "/dev/null", right: changedPath },
		});
	}
	const [staged, unstaged] = await Promise.all([
		git.diff(repoRoot, { cached: true, files: [changedPath], literalPathspecs: true }),
		git.diff(repoRoot, { files: [changedPath], literalPathspecs: true }),
	]);
	return [staged, unstaged].filter(Boolean).join("\n");
}

export async function discardRpcGitChanges(cwd: string, paths: readonly string[]): Promise<RpcGitSnapshot> {
	const repoRoot = await requireRepoRoot(cwd);
	const selected = selectCurrentEntries(await git.status.entries(repoRoot), paths);
	const untracked = selected.filter(entry => entry.kind === "untracked").map(entry => entry.path);
	const tracked = selected
		.filter(entry => entry.kind !== "untracked")
		.flatMap(entry => [entry.path, ...(entry.originalPath ? [entry.originalPath] : [])]);

	if (tracked.length > 0) {
		await git.restore(repoRoot, {
			files: tracked,
			literalPathspecs: true,
			source: "HEAD",
			staged: true,
			worktree: true,
		});
	}
	if (untracked.length > 0) {
		await git.clean(repoRoot, { literalPathspecs: true, paths: untracked });
	}
	return getRpcGitSnapshot(repoRoot);
}
