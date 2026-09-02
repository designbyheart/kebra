import { AgentBotChip } from "@/components/atoms/agent-bot-chip";
import { OutcomeChip } from "@/components/atoms/outcome-chip";
import { outcomeLabel } from "@/lib/ui/call-derive";

export type CallOutcomeCellProps = { outcome: string | null; live: boolean };

/** Outcome chip, "On the line" while live, or an em dash. */
export function CallOutcomeCell({ outcome, live }: CallOutcomeCellProps) {
  const label = outcomeLabel(outcome);
  if (label) return <OutcomeChip outcome={outcome} label={label} />;
  if (live) return <AgentBotChip label="On the line" />;
  return <span className="text-muted-foreground">—</span>;
}
