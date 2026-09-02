import type { TranscriptTurn } from "@/db/schema";
import { MaskedText } from "@/components/jobs/masked-text";
import { cn } from "@/lib/utils";

export type ExcerptLine = { index: number; role: TranscriptTurn["role"]; text: string; highlight: boolean };

/**
 * Turns [max(0, from - before), min(len, to + after)) around a
 * `change_requests.transcript_ref`. `from`/`to` are message indexes into
 * `calls.transcript`; `requestCancellation` writes both as the transcript
 * length at the moment the tool ran, so the request sits just before `from`
 * and the agent's confirmation just after. Pure; unit tested.
 */
export function sliceTranscript(
  turns: TranscriptTurn[] | null | undefined,
  ref: { from: number; to: number } | null | undefined,
  before = 6,
  after = 4,
): ExcerptLine[] {
  const list = Array.isArray(turns) ? turns : [];
  if (list.length === 0 || !ref) return [];
  const from = Math.max(0, Math.min(list.length, Math.trunc(Number(ref.from) || 0)));
  const to = Math.max(from, Math.min(list.length, Math.trunc(Number(ref.to) || 0)));
  const start = Math.max(0, from - before);
  const end = Math.min(list.length, to + after);
  const out: ExcerptLine[] = [];
  for (let i = start; i < end; i++) {
    const t = list[i];
    if (!t || typeof t.text !== "string") continue;
    out.push({ index: i, role: t.role, text: t.text, highlight: i >= from });
  }
  return out;
}

const ROLE_LABEL: Record<TranscriptTurn["role"], string> = {
  assistant: "Brianna",
  user: "Caller",
  system: "System",
  tool: "Tool",
};

/** Fallback excerpt view for cancellation tasks whose change request row is missing. */
export function TranscriptExcerpt({
  turns,
  transcriptRef,
  hasCall,
  className,
}: {
  turns: TranscriptTurn[] | null | undefined;
  transcriptRef: { from: number; to: number } | null | undefined;
  hasCall: boolean;
  className?: string;
}) {
  const lines = sliceTranscript(turns, transcriptRef);
  if (!hasCall || !turns?.length) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No transcript on file (request came from the office or the call record is missing).
      </p>
    );
  }
  if (lines.length === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>No transcript reference was recorded for this request.</p>;
  }
  return (
    <ol className={cn("divide-y overflow-hidden rounded-md border text-sm", className)}>
      {lines[0].index > 0 ? (
        <li className="px-3 py-1 text-[11px] text-muted-foreground">
          … {lines[0].index} earlier turn{lines[0].index === 1 ? "" : "s"}
        </li>
      ) : null}
      {lines.map((l) => (
        <li
          key={l.index}
          data-highlight={l.highlight || undefined}
          className={cn("grid grid-cols-[4rem_1fr] gap-2 px-3 py-1.5", l.highlight && "border-l-2 border-l-red-500 bg-red-500/8 dark:bg-red-400/10")}
        >
          <span className={cn("text-[11px] font-medium uppercase", l.role === "assistant" ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground")}>
            {ROLE_LABEL[l.role] ?? l.role}
          </span>
          <span className={cn(l.highlight && "font-medium")}>
            <MaskedText text={l.text} />
          </span>
        </li>
      ))}
    </ol>
  );
}
