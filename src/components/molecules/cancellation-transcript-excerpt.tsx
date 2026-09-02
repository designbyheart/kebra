import type { ExcerptTurn } from "@/app/inbox/cancellation-data";
import { APPROVAL_ROLE_LABEL, earlierTurnsLabel, excerptEmptyMessage, formatExcerptOffset } from "@/lib/ui/transcript-slice";
import { cn } from "@/lib/utils";

const ROLE_CLASS = { agent: "text-sky-700 dark:text-sky-300", other: "text-muted-foreground" } as const;

export type CancellationTranscriptExcerptProps = {
  excerpt: ExcerptTurn[];
  hasCall: boolean;
  turnCount: number;
};

/** The transcript passage where the caller asked to cancel (request highlighted). */
export function CancellationTranscriptExcerpt({ excerpt, hasCall, turnCount }: CancellationTranscriptExcerptProps) {
  if (!hasCall) {
    return <p className="text-sm text-muted-foreground">Requested outside a recorded call (no transcript to show).</p>;
  }
  if (!excerpt.length) {
    return <p className="text-sm text-muted-foreground">{excerptEmptyMessage(turnCount)}</p>;
  }
  const first = excerpt[0].index;
  return (
    <ol className="divide-y overflow-hidden rounded-md border text-sm">
      {first > 0 && <li className="px-3 py-1 text-xs text-muted-foreground">{earlierTurnsLabel(first)}</li>}
      {excerpt.map((t) => {
        const role = (t.role === "assistant" && "agent") || "other";
        return (
          <li
            key={t.index}
            data-highlight={t.highlight || undefined}
            className={cn("grid grid-cols-[3.5rem_2.5rem_1fr] items-baseline gap-2 px-3 py-1.5", t.highlight && "bg-red-500/8 dark:bg-red-400/10")}
          >
            <span className={cn("text-xs font-medium uppercase", ROLE_CLASS[role])}>{APPROVAL_ROLE_LABEL[t.role] ?? t.role}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatExcerptOffset(t.t)}</span>
            <span className={cn(t.highlight && "font-medium")}>{t.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
