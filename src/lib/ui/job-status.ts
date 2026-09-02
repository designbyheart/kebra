/**
 * Label and class maps for job / task / warranty pills (brief colours:
 * scheduled blue, in progress amber, complete green, canceled gray, pending
 * cancellation striped red, needs scheduling purple). Pure; no React.
 */
import { WORK_STATUSES, type JobPriority, type JobSource, type WorkStatus } from "@/lib/job-constants";
import { fmtDate, fmtDateTime } from "@/lib/ui/format";

/** Base classes every pill shares. */
export const PILL = "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium leading-none ring-1 ring-inset";

export const NEUTRAL_PILL = "bg-muted text-muted-foreground ring-border";

export const STATUS_LABEL: Record<WorkStatus, string> = {
  scheduled: "Scheduled",
  "in progress": "In progress",
  "complete rated": "Complete",
  "complete unrated": "Complete",
  "needs scheduling": "Needs scheduling",
  "user canceled": "Canceled",
  "pro canceled": "Canceled (pro)",
  pending_cancellation: "Pending cancellation",
};

/** Suffix shown in status <select>s to tell the two "Complete" apart. */
export const STATUS_OPTION_SUFFIX: Partial<Record<WorkStatus, string>> = {
  "complete rated": " (rated)",
  "complete unrated": " (unrated)",
};

export function statusOptionLabel(status: WorkStatus): string {
  return `${STATUS_LABEL[status]}${STATUS_OPTION_SUFFIX[status] ?? ""}`;
}

export const STATUS_CLASS: Record<WorkStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900",
  "in progress": "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  "complete rated": "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  "complete unrated": "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  "needs scheduling": "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900",
  "user canceled": NEUTRAL_PILL,
  "pro canceled": NEUTRAL_PILL,
  pending_cancellation:
    "bg-[repeating-linear-gradient(135deg,#fef2f2_0_4px,#fee2e2_4px_8px)] text-red-700 ring-red-300 dark:bg-[repeating-linear-gradient(135deg,#450a0a_0_4px,#7f1d1d_4px_8px)] dark:text-red-200 dark:ring-red-800",
};

/** Dot color for dense lists / timelines. */
export const STATUS_DOT: Record<WorkStatus, string> = {
  scheduled: "bg-blue-500",
  "in progress": "bg-amber-500",
  "complete rated": "bg-emerald-500",
  "complete unrated": "bg-emerald-500",
  "needs scheduling": "bg-violet-500",
  "user canceled": "bg-zinc-400",
  "pro canceled": "bg-zinc-400",
  pending_cancellation: "bg-red-500",
};

/** One accent for the agent everywhere; office / import stay neutral. */
export const AGENT_PILL = "bg-teal-600 text-white ring-teal-700 dark:bg-teal-500 dark:ring-teal-400";

export const SOURCE_LABEL: Record<JobSource, string | null> = {
  agent: "Agent",
  office: "Office",
  import: null,
};

export const SOURCE_CLASS: Record<JobSource, string> = {
  agent: AGENT_PILL,
  office: NEUTRAL_PILL,
  import: "",
};

export const PRIORITY_LABEL: Record<JobPriority, string | null> = {
  normal: null,
  high: "High priority",
  emergency: "Emergency",
};

export const PRIORITY_CLASS: Record<JobPriority, string> = {
  normal: "",
  high: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900",
  emergency: "bg-red-600 text-white ring-red-700",
};

const WARRANTY_TAG_RE = /warranty|registration|callback/i;

export const TAG_CLASS = {
  warranty: "bg-amber-50/60 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900",
  plain: "bg-muted/60 text-muted-foreground ring-border",
} as const;

export function tagTone(tag: string): keyof typeof TAG_CLASS {
  if (WARRANTY_TAG_RE.test(tag)) return "warranty";
  return "plain";
}

export type WarrantyStatus = "covered" | "partially_covered" | "expired" | "unknown";

export const WARRANTY_LABEL: Record<WarrantyStatus, string> = {
  covered: "Under warranty",
  partially_covered: "Partial warranty",
  expired: "Warranty expired",
  unknown: "Warranty unknown",
};

export const WARRANTY_CLASS: Record<WarrantyStatus, string> = {
  covered: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  partially_covered: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  expired: NEUTRAL_PILL,
  unknown: `${NEUTRAL_PILL} border-dashed`,
};

export const TASK_STATUS_LABEL = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
} as const;

export type TaskStatusKey = keyof typeof TASK_STATUS_LABEL;

export const TASK_STATUS_CLASS: Record<TaskStatusKey, string> = {
  open: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900",
  in_progress: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  dismissed: NEUTRAL_PILL,
};

// ---------------------------------------------------------------------------
// Job page actions
// ---------------------------------------------------------------------------

/** Statuses the office actions bar treats as final (no reassign / cancel). */
export const TERMINAL_STATUSES: readonly WorkStatus[] = ["complete rated", "complete unrated", "user canceled", "pro canceled"];

export function isTerminalStatus(status: WorkStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Targets offered in the status <select>: everything but the agent-only pending state. */
export const STATUS_TARGETS: readonly WorkStatus[] = WORK_STATUSES.filter((s) => s !== "pending_cancellation");

/** Initial value of the status <select>: a pending cancellation shows as "scheduled". */
export function initialStatusTarget(status: WorkStatus): WorkStatus {
  if (status === "pending_cancellation") return "scheduled";
  return status;
}

/** Why the Reschedule button is disabled, or null when rescheduling is allowed. */
export function rescheduleLockedReason(status: WorkStatus): string | null {
  switch (status) {
    case "scheduled":
    case "needs scheduling":
      return null;
    case "in progress":
      return "The tech is already on this job; change the status first.";
    case "pending_cancellation":
      return "A cancellation is pending; approve or reject it in the Inbox first.";
    default:
      return "Completed or canceled jobs can't be rescheduled. Book a new visit from the address page.";
  }
}

/** "90 min" or an em dash when no arrival window is set. */
export function arrivalWindowLabel(minutes: number | null | undefined): string {
  if (minutes) return `${minutes} min`;
  return "—";
}

type Dateish = Date | string | number | null | undefined;

/** The most recent lifecycle milestone: started > completed > canceled > created. */
export function jobTimelineLabel(job: { startedAt: Dateish; completedAt: Dateish; canceledAt: Dateish; createdAt: Dateish }): string {
  if (job.startedAt) return `Started ${fmtDateTime(job.startedAt)}`;
  if (job.completedAt) return `Completed ${fmtDate(job.completedAt)}`;
  if (job.canceledAt) return `Canceled ${fmtDate(job.canceledAt)}`;
  return `Created ${fmtDate(job.createdAt)}`;
}
