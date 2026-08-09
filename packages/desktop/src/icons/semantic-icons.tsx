import {
	Bot,
	Box,
	CircleDot,
	FileDiff,
	FolderGit2,
	Gauge,
	type LucideIcon,
	RefreshCw,
	SquareTerminal,
} from "lucide-react";

export type OmpIconName = "model" | "thinking" | "cwd" | "context" | "refresh" | "changes" | "terminal" | "agents";

interface OmpIconProps {
	name: OmpIconName;
	size?: number;
	className?: string;
}

const iconByName = {
	model: Box,
	thinking: CircleDot,
	cwd: FolderGit2,
	context: Gauge,
	refresh: RefreshCw,
	changes: FileDiff,
	terminal: SquareTerminal,
	agents: Bot,
} satisfies Record<OmpIconName, LucideIcon>;

export function OmpIcon({ name, size = 15, className }: OmpIconProps) {
	const Icon = iconByName[name];
	return <Icon aria-hidden="true" className={className} size={size} strokeWidth={1.8} />;
}
