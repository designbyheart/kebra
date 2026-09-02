import { cn } from "@/lib/utils";
import { AGENT_PILL, PILL } from "@/lib/ui/job-status";

export type AgentBadgeProps = { className?: string };

/** The one accent for the agent: a teal "Agent" pill (jobs, inbox, customers). */
export function AgentBadge({ className }: AgentBadgeProps) {
  return <span className={cn(PILL, AGENT_PILL, className)}>Agent</span>;
}
