import { Badge } from "@/components/atoms/ui/badge";
import { cn } from "@/lib/utils";
import { AGENT_BADGE } from "@/lib/ui/board-status";

const SIZE = {
  /** Sheet header: the plain shadcn badge size. */
  default: "",
  /** Activity strip. */
  compact: "h-4 px-1.5 text-xs uppercase tracking-wide",
  /** Board job cards and needs-scheduling chips (taller lanes). */
  card: "h-5 px-1.5 text-xs uppercase tracking-wide",
  /** Note rows inside the job sheet. */
  note: "h-4 px-1.5 text-xs uppercase",
} as const;

export type AgentTagProps = { size?: keyof typeof SIZE; className?: string };

/** Uppercase AGENT tag on the Today board and the activity strip. */
export function AgentTag({ size = "default", className }: AgentTagProps) {
  return <Badge className={cn(SIZE[size], AGENT_BADGE, className)}>Agent</Badge>;
}
