import { AgentBotChip } from "@/components/atoms/agent-bot-chip";
import { formatOffset, type Bubble } from "@/lib/ui/call-derive";
import { cn } from "@/lib/utils";

const SPEAKER = {
  assistant: {
    row: "justify-start",
    column: "items-start",
    heading: "",
    bubble: "rounded-tl-sm bg-teal-50 text-teal-950 dark:bg-teal-950/40 dark:text-teal-50",
  },
  user: {
    row: "justify-end",
    column: "items-end",
    heading: "justify-end",
    bubble: "rounded-tr-sm bg-muted text-foreground",
  },
} as const;

export type TranscriptTurnGroupProps = { role: keyof typeof SPEAKER; turns: Bubble[]; t: number };

/** Consecutive turns by one speaker: agent on the left, caller on the right. */
export function TranscriptTurnGroup({ role, turns, t }: TranscriptTurnGroupProps) {
  const s = SPEAKER[role];
  const agent = role === "assistant";
  return (
    <div className={cn("flex", s.row)}>
      <div className={cn("max-w-[78%] space-y-1", s.column)}>
        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", s.heading)}>
          {agent && <AgentBotChip />}
          {!agent && <span className="font-medium text-foreground">Caller</span>}
          <span className="tabular-nums">{formatOffset(t)}</span>
        </div>
        {turns.map((turn, i) => (
          <p key={i} className={cn("rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap", s.bubble)} title={formatOffset(turn.t)}>
            {turn.text}
          </p>
        ))}
      </div>
    </div>
  );
}
