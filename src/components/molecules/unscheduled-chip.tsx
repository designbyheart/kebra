"use client";

import { cn } from "@/lib/utils";
import { AgentTag } from "@/components/atoms/agent-tag";
import { PriorityFlag } from "@/components/atoms/priority-flag";
import { invoiceTag } from "@/lib/ui/board-layout";
import { statusStyle } from "@/lib/ui/board-status";
import type { Flash, UnscheduledJob } from "@/lib/ui/board-types";

export type UnscheduledChipProps = {
  job: UnscheduledJob;
  selected?: boolean;
  flash?: Flash | null;
  onSelect: (jobId: string) => void;
};

/** Compact chip for the "Needs scheduling" lane (no window → no position). */
export function UnscheduledChip({ job, selected, flash, onSelect }: UnscheduledChipProps) {
  const st = statusStyle(job.status);
  return (
    <button
      type="button"
      data-job-id={job.job_id}
      onClick={() => onSelect(job.job_id)}
      title={[job.customer_name, job.address_label, job.description, invoiceTag(job.invoice_number)].filter(Boolean).join(" · ")}
      className={cn(
        "relative flex max-w-64 min-w-40 flex-col overflow-hidden rounded-md border px-2 py-1 pl-3 text-left text-xs leading-5 shadow-xs outline-none transition-[box-shadow,border-color]",
        "focus-visible:ring-2 focus-visible:ring-ring",
        st.card,
        flash && "ring-2 ring-teal-500 ring-offset-1 ring-offset-background",
        selected && !flash && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
      <div className="flex items-center gap-1">
        <span className="truncate text-sm font-semibold">{job.customer_name}</span>
        <PriorityFlag priority={job.priority} />
        {job.source === "agent" && <AgentTag size="card" />}
        <span className="ml-auto shrink-0 font-mono text-xs opacity-60">{invoiceTag(job.invoice_number)}</span>
      </div>
      <div className="truncate text-sm opacity-80">{job.address_label ?? "No address"}</div>
      <div className="truncate opacity-70">{job.description?.trim() || "—"}</div>
    </button>
  );
}
