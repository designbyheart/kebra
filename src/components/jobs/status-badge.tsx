import { cn } from "@/lib/utils";
import type { WorkStatus } from "@/lib/job-constants";

/**
 * Status colors (brief): scheduled blue, in progress amber, complete green,
 * canceled gray, pending cancellation striped red, needs scheduling purple.
 */
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

export const STATUS_CLASS: Record<WorkStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900",
  "in progress": "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  "complete rated": "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  "complete unrated": "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  "needs scheduling": "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900",
  "user canceled": "bg-muted text-muted-foreground ring-border",
  "pro canceled": "bg-muted text-muted-foreground ring-border",
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

const pill = "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium leading-none ring-1 ring-inset";

export function StatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  return (
    <span className={cn(pill, STATUS_CLASS[status] ?? "bg-muted text-muted-foreground ring-border", className)} title={status}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** One accent for the agent everywhere; office / import stay neutral. */
export function SourceBadge({ source, className }: { source: "import" | "agent" | "office"; className?: string }) {
  if (source === "agent") {
    return <span className={cn(pill, "bg-teal-600 text-white ring-teal-700 dark:bg-teal-500 dark:ring-teal-400", className)}>Agent</span>;
  }
  if (source === "office") {
    return <span className={cn(pill, "bg-muted text-muted-foreground ring-border", className)}>Office</span>;
  }
  return null;
}

export function AgentBadge({ className }: { className?: string }) {
  return <SourceBadge source="agent" className={className} />;
}

export function PriorityBadge({ priority, className }: { priority: "normal" | "high" | "emergency"; className?: string }) {
  if (priority === "normal") return null;
  return (
    <span
      className={cn(
        pill,
        priority === "emergency"
          ? "bg-red-600 text-white ring-red-700"
          : "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900",
        className,
      )}
    >
      {priority === "emergency" ? "Emergency" : "High priority"}
    </span>
  );
}

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  const warranty = /warranty|registration|callback/i.test(tag);
  return (
    <span
      className={cn(
        pill,
        "font-normal",
        warranty ? "bg-amber-50/60 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900" : "bg-muted/60 text-muted-foreground ring-border",
        className,
      )}
    >
      {tag}
    </span>
  );
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
  expired: "bg-muted text-muted-foreground ring-border",
  unknown: "bg-muted text-muted-foreground ring-border border-dashed",
};

export function WarrantyPill({ status, className, children }: { status: WarrantyStatus; className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn(pill, "h-6 px-2 text-xs", WARRANTY_CLASS[status], className)}>
      {children ?? WARRANTY_LABEL[status]}
    </span>
  );
}

export const TASK_STATUS_LABEL = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
} as const;

export function TaskStatusBadge({ status, className }: { status: keyof typeof TASK_STATUS_LABEL; className?: string }) {
  const cls =
    status === "open"
      ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900"
      : status === "in_progress"
        ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900"
        : status === "done"
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900"
          : "bg-muted text-muted-foreground ring-border";
  return <span className={cn(pill, cls, className)}>{TASK_STATUS_LABEL[status]}</span>;
}
