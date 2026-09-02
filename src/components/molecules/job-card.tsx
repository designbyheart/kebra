"use client";

import { RotateCcw, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentTag } from "@/components/atoms/agent-tag";
import { PriorityFlag } from "@/components/atoms/priority-flag";
import { cardPositionStyle, invoiceTag, shortRange, techLine, type CardPosition } from "@/lib/ui/board-layout";
import { statusStyle } from "@/lib/ui/board-status";
import type { BoardJob, Flash } from "@/lib/ui/board-types";

export type JobCardProps = {
  job: BoardJob;
  position: CardPosition;
  lane: number;
  flash?: Flash | null;
  selected?: boolean;
  onSelect: (jobId: string) => void;
};

/** A job positioned on the board grid by its arrival window and stacking lane. */
export function JobCard({ job, position, lane, flash, selected, onSelect }: JobCardProps) {
  const st = statusStyle(job.status);
  const title = [job.customer_name, job.window_label, job.address_label, job.description, invoiceTag(job.invoice_number), techLine(job.tech_names), st.label]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      data-job-id={job.job_id}
      title={title}
      onClick={() => onSelect(job.job_id)}
      style={cardPositionStyle(position, lane)}
      className={cn(
        "group absolute z-[1] overflow-hidden rounded-md border text-left text-xs leading-5 shadow-xs outline-none transition-[box-shadow,border-color,opacity] duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring",
        st.card,
        position.clipped && "border-dashed",
        flash === "new" && "animate-in fade-in zoom-in-95 slide-in-from-left-2 duration-500",
        flash && "ring-2 ring-teal-500 ring-offset-1 ring-offset-background",
        selected && !flash && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
      <div className="flex h-full flex-col px-2 py-1.5 pl-3">
        <div className="flex items-center gap-1">
          <span className="shrink-0 font-mono text-xs tabular-nums opacity-70">{shortRange(job.window_start, job.window_end)}</span>
          <PriorityFlag priority={job.priority} />
          {job.source === "agent" && <AgentTag size="card" />}
          {job.is_install && <Wrench className="size-3 shrink-0 opacity-60" aria-label="Install" />}
          {job.is_callback && <RotateCcw className="size-3 shrink-0 opacity-60" aria-label="Callback" />}
          <span className="ml-auto shrink-0 font-mono text-xs opacity-60">{invoiceTag(job.invoice_number)}</span>
        </div>
        <div className="truncate text-sm font-semibold">{job.customer_name}</div>
        <div className="truncate text-sm opacity-80">{job.address_label ?? "No address"}</div>
        <div className="truncate opacity-70">{job.description?.trim() || st.label}</div>
      </div>
    </button>
  );
}
