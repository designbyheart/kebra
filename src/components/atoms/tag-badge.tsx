import { cn } from "@/lib/utils";
import { PILL, TAG_CLASS, tagTone } from "@/lib/ui/job-status";

export type TagBadgeProps = { tag: string; className?: string };

/** Job tag pill; warranty / registration / callback tags get an amber tint. */
export function TagBadge({ tag, className }: TagBadgeProps) {
  return <span className={cn(PILL, "font-normal", TAG_CLASS[tagTone(tag)], className)}>{tag}</span>;
}
