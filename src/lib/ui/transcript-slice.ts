import type { TranscriptTurn } from "@/db/schema";
import { formatDateTimeET } from "@/lib/time";

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

/** Speaker labels for the fallback excerpt (the agent's name, not "Agent"). */
export const EXCERPT_ROLE_LABEL: Record<TranscriptTurn["role"], string> = {
  assistant: "Brianna",
  user: "Caller",
  system: "System",
  tool: "Tool",
};

/** Speaker labels for the cancellation approval card. */
export const APPROVAL_ROLE_LABEL: Record<TranscriptTurn["role"], string> = {
  user: "Caller",
  assistant: "Agent",
  system: "System",
  tool: "Tool",
};

/** "3 earlier turns" / "1 earlier turn" */
export function earlierTurnsLabel(n: number): string {
  if (n === 1) return "… 1 earlier turn";
  return `… ${n} earlier turns`;
}

/** `t` is seconds into the call (W2-A); tolerate epoch millis from older rows. */
export function formatExcerptOffset(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "";
  if (t > 1e12) return formatDateTimeET(t).split(", ").pop() ?? "";
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Why the approval card has no passage to show for a call that exists. */
export function excerptEmptyMessage(turnCount: number): string {
  if (turnCount) return "No transcript reference was recorded for this request.";
  return "Transcript not available yet.";
}
