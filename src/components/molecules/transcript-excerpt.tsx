import type { TranscriptTurn } from "@/db/schema";
import { MaskedText } from "@/components/atoms/masked-text";
import { EXCERPT_ROLE_LABEL, earlierTurnsLabel, sliceTranscript } from "@/lib/ui/transcript-slice";
import { cn } from "@/lib/utils";

const ROLE_CLASS = { agent: "text-teal-700 dark:text-teal-300", other: "text-muted-foreground" } as const;

export type TranscriptExcerptProps = {
  turns: TranscriptTurn[] | null | undefined;
  transcriptRef: { from: number; to: number } | null | undefined;
  hasCall: boolean;
  className?: string;
};

/** Fallback excerpt view for cancellation tasks whose change request row is missing. */
export function TranscriptExcerpt({ turns, transcriptRef, hasCall, className }: TranscriptExcerptProps) {
  const lines = sliceTranscript(turns, transcriptRef);
  if (!hasCall || !turns?.length) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No transcript on file (request came from the office or the call record is missing).</p>;
  }
  if (lines.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No transcript reference was recorded for this request.</p>;
  }
  const first = lines[0].index;
  return (
    <ol className={cn("divide-y overflow-hidden rounded-md border text-sm", className)}>
      {first > 0 && <li className="px-3 py-1 text-xs text-muted-foreground">{earlierTurnsLabel(first)}</li>}
      {lines.map((l) => {
        const role = (l.role === "assistant" && "agent") || "other";
        return (
          <li
            key={l.index}
            data-highlight={l.highlight || undefined}
            className={cn("grid grid-cols-[4rem_1fr] gap-2 px-3 py-1.5", l.highlight && "border-l-2 border-l-red-500 bg-red-500/8 dark:bg-red-400/10")}
          >
            <span className={cn("text-xs font-medium uppercase", ROLE_CLASS[role])}>{EXCERPT_ROLE_LABEL[l.role] ?? l.role}</span>
            <span className={cn(l.highlight && "font-medium")}>
              <MaskedText text={l.text} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
