/**
 * Pure helpers for the Calls pages (W2-C). No DB, no React: tested in
 * derive.test.ts. Everything the list and the detail page compute from a
 * `calls` row and its `events` lives here so both the server render and the
 * client refresh agree.
 */
import type { ToolCallRecord, TranscriptTurn } from "@/db/schema";

// ---------------------------------------------------------------------------
// Transcript timeline
// ---------------------------------------------------------------------------

export type Bubble = { text: string; t: number };

export type TimelineItem =
  | { kind: "group"; role: "assistant" | "user"; turns: Bubble[]; t: number }
  | { kind: "tool"; call: ToolCallRecord; label: string; t: number }
  | { kind: "system"; text: string; t: number };

/**
 * Merge transcript turns and tool calls into one ordered timeline. Consecutive
 * turns by the same speaker collapse into one group; a tool call or system
 * line breaks the group. Ordering is by `t` (seconds since call start); ties
 * keep transcript order and place tool calls after the turn that triggered them.
 */
export function buildTimeline(turns: TranscriptTurn[], toolCalls: ToolCallRecord[] = []): TimelineItem[] {
  type Raw = { t: number; seq: number; item: TimelineItem };
  const raw: Raw[] = [];
  turns.forEach((turn, i) => {
    const t = num(turn.t);
    if (turn.role === "system" || turn.role === "tool") {
      raw.push({ t, seq: i, item: { kind: "system", text: turn.text, t } });
    } else {
      raw.push({ t, seq: i, item: { kind: "group", role: turn.role, turns: [{ text: turn.text, t }], t } });
    }
  });
  toolCalls.forEach((call, i) => {
    const t = num(call.t);
    raw.push({ t, seq: turns.length + i + 0.5, item: { kind: "tool", call, label: describeToolCall(call), t } });
  });
  raw.sort((a, b) => a.t - b.t || a.seq - b.seq);

  const out: TimelineItem[] = [];
  for (const { item } of raw) {
    const last = out[out.length - 1];
    if (item.kind === "group" && last?.kind === "group" && last.role === item.role) {
      last.turns.push(...item.turns);
      continue;
    }
    out.push(item);
  }
  return out;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** "looked up 3284 Harborlight Hollow · 210 ms" */
export function describeToolCall(call: ToolCallRecord): string {
  const base = toolVerb(call);
  const ms = typeof call.durationMs === "number" ? ` · ${Math.round(call.durationMs)} ms` : "";
  const failed = call.ok === false ? " · failed" : "";
  return `${base}${ms}${failed}`;
}

function toolVerb(call: ToolCallRecord): string {
  const a = (call.args ?? {}) as Record<string, unknown>;
  const r = (call.result ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  switch (call.name) {
    case "find_address": {
      const q = [s(a.query), s(a.unit)].filter(Boolean).join(" ");
      return q ? `looked up ${q}` : "looked up an address";
    }
    case "find_customer": {
      const q = s(a.company) ?? s(a.name) ?? s(a.phone);
      return q ? `looked up ${q}` : "looked up a customer";
    }
    case "get_address_dossier":
      return `pulled history for ${s(r.address_label) ?? "the address"}`;
    case "get_visit_history":
      return "pulled visit history";
    case "get_job_notes":
      return `read tech notes${s(r.invoice_number) ? ` on #${r.invoice_number}` : ""}`;
    case "get_job":
      return `looked up job${s(r.invoice_number) ? ` #${r.invoice_number}` : ""}`;
    case "check_warranty":
      return `checked warranty${s(r.status) ? `: ${String(r.status).replace(/_/g, " ")}` : ""}`;
    case "get_open_balance":
      return "checked open balance";
    case "get_schedule":
      return `checked the board${s(a.date) ? ` for ${a.date}` : ""}`;
    case "find_availability": {
      const n = Array.isArray(r.slots) ? r.slots.length : null;
      return `searched openings${n != null ? ` (${n} found)` : ""}`;
    }
    case "book_job":
      return `booked job${s(r.invoice_number) ? ` #${r.invoice_number}` : ""}`;
    case "reschedule_job":
      return "rescheduled the visit";
    case "request_cancellation":
      return "requested a cancellation";
    case "add_note":
      return "added a note";
    case "create_task":
      return `created a ${s(a.kind) ?? "follow-up"} task`;
    case "save_caller_phone":
      return "saved the caller's number";
    case "transfer_call":
    case "transferCall":
      return "transferred the call";
    case "get_weather":
      return "checked the weather";
    case "web_search":
      return `searched the web${s(a.query) ? ` for “${a.query}”` : ""}`;
    default:
      return `ran ${call.name}`;
  }
}

// ---------------------------------------------------------------------------
// Actions taken (derived from events where call_id = ?)
// ---------------------------------------------------------------------------

export type EventLike = {
  id: number;
  ts: Date | string;
  actor: "agent" | "office" | "system";
  type: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
};

export type ActionKind =
  | "booking"
  | "reschedule"
  | "cancellation"
  | "note"
  | "task"
  | "identified"
  | "transfer"
  | "phone"
  | "other";

export type ActionItem = {
  id: number;
  ts: string;
  type: string;
  kind: ActionKind;
  label: string;
  actorLabel: string;
  agent: boolean;
  href: string | null;
  fixture: boolean;
};

/** Lifecycle rows that belong in the header, not in "Actions taken". */
const LIFECYCLE = new Set(["call.started", "call.ended", "call.analyzed", "call.reviewed"]);

export function isActionEvent(type: string): boolean {
  return !LIFECYCLE.has(type);
}

export function deriveActions(events: EventLike[]): ActionItem[] {
  return [...events]
    .filter((e) => isActionEvent(e.type))
    .sort((a, b) => a.id - b.id)
    .map((e) => {
      const p = e.payload ?? {};
      const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
      const jobId = str("job_id") ?? (e.entityType === "job" ? e.entityId : null);
      const taskId = str("task_id") ?? (e.entityType === "task" ? e.entityId : null);
      const customerId = str("customer_id") ?? (e.entityType === "customer" ? e.entityId : null);
      let kind: ActionKind = "other";
      let href: string | null = null;
      if (e.type === "job.booked") {
        kind = "booking";
        href = jobId ? `/jobs/${jobId}` : null;
      } else if (e.type === "job.rescheduled" || e.type === "job.reassigned" || e.type === "job.status_changed") {
        kind = "reschedule";
        href = jobId ? `/jobs/${jobId}` : null;
      } else if (e.type.startsWith("job.cancellation")) {
        kind = "cancellation";
        href = jobId ? `/jobs/${jobId}` : null;
      } else if (e.type === "note.added") {
        kind = "note";
        href = jobId ? `/jobs/${jobId}` : null;
      } else if (e.type.startsWith("task.")) {
        kind = "task";
        href = taskId ? `/inbox?task=${taskId}` : "/inbox";
      } else if (e.type === "call.identified") {
        kind = "identified";
        href = customerId ? `/customers/${customerId}` : null;
      } else if (e.type.startsWith("call.transfer")) {
        kind = "transfer";
      } else if (e.type === "customer.phone_added") {
        kind = "phone";
        href = customerId ? `/customers/${customerId}` : null;
      }
      return {
        id: e.id,
        ts: e.ts instanceof Date ? e.ts.toISOString() : String(e.ts),
        type: e.type,
        kind,
        label: str("summary") ?? e.type,
        actorLabel: str("actor_label") ?? (e.actor === "agent" ? "Agent" : e.actor === "system" ? "System" : "Office"),
        agent: e.actor === "agent",
        href,
        fixture: p.fixture === true,
      };
    });
}

/** Did the agent try to hand this call to a person? */
export function hasHandoff(input: {
  outcome: string | null;
  handoffReason: string | null;
  status: string;
  events?: Pick<EventLike, "type">[];
}): boolean {
  if (input.status === "forwarding") return true;
  if (input.outcome === "handoff") return true;
  if (input.handoffReason) return true;
  return (input.events ?? []).some((e) => e.type.startsWith("call.transfer"));
}

// ---------------------------------------------------------------------------
// Presentation helpers shared by list + detail
// ---------------------------------------------------------------------------

export const LIVE_STATUSES = new Set(["ringing", "in_progress", "forwarding"]);

export function isLive(status: string): boolean {
  return LIVE_STATUSES.has(status);
}

/** "+13055550142" → "+1 (305) •••-0142". Non-US numbers keep only the last 4. */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) •••-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `+1 (${digits.slice(0, 3)}) •••-${digits.slice(6)}`;
  return `${e164.startsWith("+") ? "+" : ""}••• ${digits.slice(-4)}`;
}

export function callerLabel(input: { direction: string; callerNumber: string | null }): string {
  if (input.direction === "web") return "Web";
  return maskPhone(input.callerNumber) ?? "Unknown";
}

/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Seconds since call start, for a live call, or the stored duration. */
export function durationSeconds(startedAt: Date | string, endedAt: Date | string | null, now = new Date()): number {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Offset (s) → "0:42" label on a transcript bubble. */
export function formatOffset(t: number): string {
  return formatDuration(Math.max(0, Math.floor(t)));
}

export const OUTCOME_LABEL: Record<string, string> = {
  booked: "Booked",
  rescheduled: "Rescheduled",
  canceled: "Canceled",
  cancellation_requested: "Cancel requested",
  info: "Info",
  handoff: "Handoff",
  voicemail: "Voicemail",
  callback: "Callback",
  no_action: "No action",
};

export function outcomeLabel(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  return OUTCOME_LABEL[outcome] ?? outcome.replace(/_/g, " ");
}

/** Tailwind classes for an outcome chip (status palette from the brief). */
export function outcomeTone(outcome: string | null | undefined): string {
  switch (outcome) {
    case "booked":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "rescheduled":
      return "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300";
    case "canceled":
    case "cancellation_requested":
      return "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300";
    case "handoff":
      return "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300";
    case "voicemail":
    case "no_action":
      return "bg-muted text-muted-foreground ring-border";
    default:
      return "bg-muted text-foreground ring-border";
  }
}

export const STATUS_LABEL: Record<string, string> = {
  ringing: "Ringing",
  in_progress: "Live",
  forwarding: "Transferring",
  ended: "Ended",
  failed: "Failed",
};

export function endedReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    "customer-ended-call": "Caller hung up",
    "assistant-ended-call": "Agent ended the call",
    "assistant-forwarded-call": "Forwarded to the office",
    "assistant-transfer-failed": "Transfer failed",
    "silence-timed-out": "Silence timeout",
    "max-duration-reached": "Max duration reached",
    voicemail: "Went to voicemail",
  };
  return map[reason] ?? reason.replace(/[-_]/g, " ");
}
