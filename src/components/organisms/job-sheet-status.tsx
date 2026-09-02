"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";
import { cancelAction, setStatusAction } from "@/app/today/actions";
import { invoiceTag } from "@/lib/ui/board-layout";
import { statusOptionsFor, statusStyle } from "@/lib/ui/board-status";
import type { JobSheetData, Run } from "@/lib/ui/board-types";

export type JobSheetStatusProps = {
  job: JobSheetData["job"];
  disabled: boolean;
  run: Run;
};

/** Set the work status by hand, or cancel the job with a reason. */
export function JobSheetStatus({ job, disabled, run }: JobSheetStatusProps) {
  const [status, setStatus] = useState<string>(job.workStatus);
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const canceled = job.workStatus === "user canceled" || job.workStatus === "pro canceled";
  const options = statusOptionsFor(job.workStatus);
  return (
    <section className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <NativeSelect aria-label="New status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled}>
          {options.map((s) => (
            <option key={s} value={s}>
              {statusStyle(s).label}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          size="sm"
          disabled={disabled || status === job.workStatus}
          onClick={() => run(`Status set to ${statusStyle(status as JobSheetData["job"]["workStatus"]).label.toLowerCase()}`, () => setStatusAction(job.id, status, note), () => setNote(""))}
        >
          Apply
        </Button>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" disabled={disabled} className="col-span-2 h-8 text-sm" />
      </div>
      {!canceled && (
        <div className="rounded-md border border-dashed p-2.5">
          <div className="mb-1.5 text-sm font-medium text-muted-foreground">Cancel this job</div>
          <div className="flex items-center gap-2">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" disabled={disabled} className="h-8 text-sm" />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={disabled || !cancelReason.trim()}
              onClick={() => {
                if (!window.confirm(`Cancel job ${invoiceTag(job.invoiceNumber)} for ${job.customerName}?`)) return;
                run("Job canceled", () => cancelAction(job.id, cancelReason), () => setCancelReason(""));
              }}
            >
              Cancel job
            </Button>
          </div>
          {job.workStatus === "pending_cancellation" && <p className="mt-1 text-xs text-muted-foreground">This also approves the pending request.</p>}
        </div>
      )}
    </section>
  );
}
