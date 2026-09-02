/**
 * Pure helpers for the Inbox (no DB): kind ordering, grouping and the status
 * filter vocabulary. Unit tested in inbox-grouping.test.ts.
 */
import type { Task } from "@/db/schema";
import { formatDateTimeET } from "@/lib/time";

export type TaskKind = Task["kind"];
export type TaskStatus = Task["status"];

/** Display order: approvals first, then things a person promised to do. */
export const KIND_ORDER: readonly TaskKind[] = ["cancellation", "handoff", "callback", "review", "followup"];

export const KIND_LABEL: Record<TaskKind, { one: string; many: string; hint: string }> = {
  cancellation: { one: "Cancellation", many: "Cancellations", hint: "Requests the agent took on the phone; an admin approves or rejects." },
  handoff: { one: "Handoff", many: "Handoffs", hint: "The caller asked for a person and nobody picked up; call them back." },
  callback: { one: "Callback", many: "Callbacks", hint: "Someone promised the caller a call back." },
  review: { one: "Review", many: "Reviews", hint: "Calls or notes the agent flagged for a human look." },
  followup: { one: "Follow-up", many: "Follow-ups", hint: "Loose ends: parts, estimates, registrations." },
};

export const STATUS_FILTERS = ["open", "in_progress", "done", "dismissed", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
  all: "All",
};

export function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "") ? (v as StatusFilter) : "open";
}

export function parseKindFilter(raw: string | string[] | undefined): TaskKind | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (KIND_ORDER as readonly string[]).includes(v ?? "") ? (v as TaskKind) : null;
}

/** Group by kind in KIND_ORDER; every kind is present (possibly empty) unless `only` is set. */
export function groupByKind<T extends { kind: TaskKind }>(items: T[], only: TaskKind | null = null): { kind: TaskKind; items: T[] }[] {
  const kinds = only ? [only] : KIND_ORDER;
  return kinds.map((kind) => ({ kind, items: items.filter((t) => t.kind === kind) }));
}

/**
 * Work order inside a group: overdue first, then earliest due, then newest
 * created. Tasks without a due date sort after dated ones.
 */
export function sortTasks<T extends { dueAt: Date | null; createdAt: Date }>(items: T[], now: Date = new Date()): T[] {
  const n = now.getTime();
  return [...items].sort((a, b) => {
    const ao = a.dueAt && a.dueAt.getTime() < n ? 0 : 1;
    const bo = b.dueAt && b.dueAt.getTime() < n ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const ad = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function isOverdue(t: { dueAt: Date | null; status: TaskStatus }, now: Date = new Date()): boolean {
  return Boolean(t.dueAt && t.dueAt.getTime() < now.getTime() && (t.status === "open" || t.status === "in_progress"));
}

/** Buttons offered for a task in a given status. */
export function transitionsFor(status: TaskStatus): { to: TaskStatus; label: string }[] {
  switch (status) {
    case "open":
      return [
        { to: "in_progress", label: "Start" },
        { to: "done", label: "Resolve" },
        { to: "dismissed", label: "Dismiss" },
      ];
    case "in_progress":
      return [
        { to: "done", label: "Resolve" },
        { to: "dismissed", label: "Dismiss" },
        { to: "open", label: "Back to open" },
      ];
    case "done":
    case "dismissed":
      return [{ to: "open", label: "Reopen" }];
  }
}

// ---------------------------------------------------------------------------
// URL helpers and copy
// ---------------------------------------------------------------------------

/** `?task=<id>` deep link: the task to highlight, if any. */
export function parseTaskFocus(raw: string | string[] | undefined): string | null {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/** Link to /inbox with the given filters; the defaults are omitted from the query. */
export function inboxHref(status: StatusFilter, kind: TaskKind | null): string {
  const q = new URLSearchParams();
  if (status !== "open") q.set("status", status);
  if (kind) q.set("kind", kind);
  const s = q.toString();
  if (s) return `/inbox?${s}`;
  return "/inbox";
}

/** Where the job page's pending-cancellation banner sends the office. */
export function cancellationReviewHref(taskId: string | null): string {
  if (taskId) return `/inbox?kind=cancellation&task=${encodeURIComponent(taskId)}`;
  return "/inbox?kind=cancellation";
}

const EMPTY_PREFIX: Record<StatusFilter, string> = {
  open: "No open",
  in_progress: "Nothing in progress under",
  done: "Nothing done under",
  dismissed: "Nothing dismissed under",
  all: "No",
};

export const INBOX_ZERO = "Inbox zero. New handoffs, callbacks and cancellation requests land here the moment the agent files them.";

/** Empty state for the whole list. */
export function inboxEmptyMessage(status: StatusFilter, kind: TaskKind | null): string {
  if (status === "open" && !kind) return INBOX_ZERO;
  const what = (kind && KIND_LABEL[kind].many.toLowerCase()) || "tasks";
  return `${EMPTY_PREFIX[status]} ${what}.`;
}

/** Empty state for one kind section. */
export function groupEmptyMessage(status: StatusFilter, kind: TaskKind): string {
  return `${EMPTY_PREFIX[status]} ${KIND_LABEL[kind].many.toLowerCase()}.`;
}

/** Page description of /inbox/cancellations, by viewer role. */
export function cancellationsDescription(admin: boolean): string {
  if (admin) return "Requests the agent took on the phone. Approve to cancel the job, or reject with a note and we call the customer back.";
  return "Requests the agent took on the phone. Only an admin or the owner can approve them.";
}

/** Who can approve, for the non-admin footer of the approval card. */
export function approversLine(approvers: readonly string[]): string {
  if (approvers.length) return `Can approve: ${approvers.join(", ")}`;
  return "No admin users are set up yet.";
}

export type ResolutionFields = {
  status: "pending" | "approved" | "rejected";
  resolvedByName: string | null;
  resolvedAt: Date | string | number | null;
  resolutionNote: string | null;
  previousStatus: string | null;
};

/** "Approved by Pat · Sep 2, 2026, 3:12 PM · “note” · status restored to scheduled" */
export function resolutionLine(r: ResolutionFields): string {
  const verb = (r.status === "approved" && "Approved") || "Rejected";
  let out = `${verb} by ${r.resolvedByName ?? "office"}`;
  if (r.resolvedAt) out += ` · ${formatDateTimeET(r.resolvedAt)}`;
  if (r.resolutionNote) out += ` · “${r.resolutionNote}”`;
  if (r.status === "rejected" && r.previousStatus) out += ` · status restored to ${r.previousStatus}`;
  return out;
}
