export interface DesktopProject {
	id: string;
	title: string;
	cwd: string;
}

export interface DesktopProjectDraft {
	title: string;
	cwd: string;
}

export function workspaceName(cwd: string): string {
	const trimmed = cwd.replace(/[\\/]+$/, "");
	return trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd;
}

export function createDesktopProject(draft: DesktopProjectDraft, id: string): DesktopProject {
	return {
		id,
		title: draft.title.trim() || workspaceName(draft.cwd),
		cwd: draft.cwd.trim(),
	};
}
