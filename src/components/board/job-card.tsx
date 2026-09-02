"use client";

import { Flag, Wrench, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CardPosition } from "./layout";
import { shortRange } from "./layout";
import { AGENT_BADGE, PRIORITY_STYLE, statusStyle } from "./status";
import type { BoardJob, UnscheduledJob } from "./types";

export type Flash = "new" | "changed";

export const LANE_H = 76;
const CARD_GAP = 4;

type Props = {
  job: BoardJob;
  position: CardPosition;
  lane: number;
  flash?: Flash | null;
  selected?: boolean;
  onSelect: (jobId: string) => void;
};

export function JobCard({ job, position, lane, flash, selected, onSelect }: Props) {
  const st = statusStyle(job.status);
  const pr = PRIORITY_STYLE[job.priority];
  const title = [
    job.customer_name,
    job.window_label,
    job.address_label,
    job.description,
    job.invoice_number ? `#${job.invoice_number}` : null,
    job.tech_names.length ? `Tech: ${job.tech_names.join(", ")}` : "Unassigned",
    st.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      data-job-id={job.job_id}
      title={title}
      onClick={() => onSelect(job.job_id)}
      style={{
        left: `${position.leftPct}%`,
        width: `${position.widthPct}%`,
        top: lane * LANE_H + CARD_GAP,
        height: LANE_H - CARD_GAP * 2,
        ...st.style,
      }}
      className={cn(
        "group absolute z-[1] overflow-hidden rounded-md border text-left text-[11px] leading-[1.3] shadow-xs outline-none transition-[box-shadow,border-color,opacity] duration-200",
        "focus-visible:ring-2 focus-visible:ring-ring",
        st.card,
        position.clipped && "border-dashed",
        flash === "new" && "animate-in fade-in zoom-in-95 slide-in-from-left-2 duration-500",
        flash && "ring-2 ring-teal-500 ring-offset-1 ring-offset-background",
        selected && !flash && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
      <div className="flex h-full flex-col px-1.5 py-1 pl-2.5">
        <div className="flex items-center gap-1">
          <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">{shortRange(job.window_start, job.window_end)}</span>
          {pr.show ? <Flag className={cn("size-3 shrink-0", pr.text)} aria-label={pr.label} fill="currentColor" /> : null}
          {job.source === "agent" ? (
            <Badge className={cn("h-4 px-1.5 text-[9px] uppercase tracking-wide", AGENT_BADGE)}>Agent</Badge>
          ) : null}
          {job.is_install ? <Wrench className="size-3 shrink-0 opacity-60" aria-label="Install" /> : null}
          {job.is_callback ? <RotateCcw className="size-3 shrink-0 opacity-60" aria-label="Callback" /> : null}
          <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">{job.invoice_number ? `#${job.invoice_number}` : ""}</span>
        </div>
        <div className="truncate font-semibold">{job.customer_name}</div>
        <div className="truncate opacity-80">{job.address_label ?? "No address"}</div>
        <div className="truncate opacity-70">{job.description?.trim() || st.label}</div>
      </div>
    </button>
  );
}

/** Compact chip for the "Needs scheduling" lane (no window → no position). */
export function UnscheduledChip({
  job,
  selected,
  flash,
  onSelect,
}: {
  job: UnscheduledJob;
  selected?: boolean;
  flash?: Flash | null;
  onSelect: (jobId: string) => void;
}) {
  const st = statusStyle(job.status);
  const pr = PRIORITY_STYLE[job.priority];
  return (
    <button
      type="button"
      data-job-id={job.job_id}
      onClick={() => onSelect(job.job_id)}
      title={[job.customer_name, job.address_label, job.description, job.invoice_number ? `#${job.invoice_number}` : null].filter(Boolean).join(" · ")}
      className={cn(
        "relative flex max-w-64 min-w-40 flex-col overflow-hidden rounded-md border px-2 py-1 pl-3 text-left text-[11px] leading-[1.3] shadow-xs outline-none transition-[box-shadow,border-color]",
        "focus-visible:ring-2 focus-visible:ring-ring",
        st.card,
        flash && "ring-2 ring-teal-500 ring-offset-1 ring-offset-background",
        selected && !flash && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
      <div className="flex items-center gap-1">
        <span className="truncate font-semibold">{job.customer_name}</span>
        {pr.show ? <Flag className={cn("size-3 shrink-0", pr.text)} fill="currentColor" aria-label={pr.label} /> : null}
        {job.source === "agent" ? <Badge className={cn("h-4 px-1.5 text-[9px] uppercase tracking-wide", AGENT_BADGE)}>Agent</Badge> : null}
        <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">{job.invoice_number ? `#${job.invoice_number}` : ""}</span>
      </div>
      <div className="truncate opacity-80">{job.address_label ?? "No address"}</div>
      <div className="truncate opacity-70">{job.description?.trim() || "—"}</div>
    </button>
  );
}
