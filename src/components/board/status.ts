/**
 * Status vocabulary for the board: one colour per work status (brief W2-B),
 * one accent for the agent. Keep this the single place that knows colours.
 */
import type { CSSProperties } from "react";
import type { JobPriority, WorkStatus } from "./types";

export type StatusStyle = {
  label: string;
  short: string;
  /** Card surface + border. */
  card: string;
  /** Left accent bar. */
  bar: string;
  /** Small dot / chip. */
  dot: string;
  chip: string;
  style?: CSSProperties;
};

const STRIPES: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklch, var(--color-red-500) 14%, transparent) 6px 12px)",
};

export const STATUS_STYLE: Record<WorkStatus, StatusStyle> = {
  scheduled: {
    label: "Scheduled",
    short: "Scheduled",
    card: "border-blue-200 bg-blue-50 text-blue-950 hover:border-blue-400 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-50",
    bar: "bg-blue-500",
    dot: "bg-blue-500",
    chip: "bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100",
  },
  "in progress": {
    label: "In progress",
    short: "In progress",
    card: "border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-500 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-50",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
  },
  "complete rated": {
    label: "Complete (rated)",
    short: "Complete",
    card: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-50",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100",
  },
  "complete unrated": {
    label: "Complete (unrated)",
    short: "Complete",
    card: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-50",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100",
  },
  "needs scheduling": {
    label: "Needs scheduling",
    short: "Needs sched.",
    card: "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-400 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-50",
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100",
  },
  "user canceled": {
    label: "Canceled by customer",
    short: "Canceled",
    card: "border-gray-200 bg-gray-50 text-gray-500 opacity-80 hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400",
    bar: "bg-gray-400",
    dot: "bg-gray-400",
    chip: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  "pro canceled": {
    label: "Canceled by office",
    short: "Canceled",
    card: "border-gray-200 bg-gray-50 text-gray-500 opacity-80 hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400",
    bar: "bg-gray-400",
    dot: "bg-gray-400",
    chip: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  pending_cancellation: {
    label: "Pending cancellation",
    short: "Pending cancel",
    card: "border-red-300 bg-red-50 text-red-950 hover:border-red-500 dark:border-red-900 dark:bg-red-950/50 dark:text-red-50",
    bar: "bg-red-500",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-900 dark:bg-red-900/60 dark:text-red-100",
    style: STRIPES,
  },
};

export function statusStyle(status: WorkStatus): StatusStyle {
  return STATUS_STYLE[status] ?? STATUS_STYLE.scheduled;
}

export const CANCELED: readonly WorkStatus[] = ["user canceled", "pro canceled"];
export function isCanceledStatus(s: WorkStatus): boolean {
  return CANCELED.includes(s);
}

/** Statuses the office may set by hand from the sheet (cancellation has its own button). */
export const OFFICE_SETTABLE: readonly WorkStatus[] = [
  "scheduled",
  "in progress",
  "complete rated",
  "complete unrated",
  "needs scheduling",
];

export const PRIORITY_STYLE: Record<JobPriority, { label: string; text: string; show: boolean }> = {
  normal: { label: "Normal", text: "text-muted-foreground", show: false },
  high: { label: "High priority", text: "text-orange-600 dark:text-orange-400", show: true },
  emergency: { label: "Emergency", text: "text-red-600 dark:text-red-400", show: true },
};

/** The one accent reserved for the agent. */
export const AGENT_BADGE = "border-transparent bg-teal-600 text-white dark:bg-teal-500 dark:text-teal-950";

export const NOTE_AUTHOR_LABEL: Record<string, string> = {
  tech: "Tech",
  office: "Office",
  agent: "Agent",
  system: "System",
};
