import { TranscriptSystemLine } from "@/components/molecules/transcript-system-line";
import { TranscriptToolChip } from "@/components/molecules/transcript-tool-chip";
import { TranscriptTurnGroup } from "@/components/molecules/transcript-turn-group";
import type { TimelineItem } from "@/lib/ui/call-derive";

export type TranscriptItemProps = { item: TimelineItem };

/** Dispatches one timeline item to the tool chip, system line or turn group. */
export function TranscriptItem({ item }: TranscriptItemProps) {
  if (item.kind === "tool") return <TranscriptToolChip call={item.call} label={item.label} t={item.t} />;
  if (item.kind === "system") return <TranscriptSystemLine text={item.text} t={item.t} />;
  return <TranscriptTurnGroup role={item.role} turns={item.turns} t={item.t} />;
}
