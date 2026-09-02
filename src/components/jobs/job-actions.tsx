"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignJobAction, setJobStatusAction } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { WORK_STATUSES, type WorkStatus } from "@/lib/job-constants";
import { STATUS_LABEL } from "./status-badge";
import { CancelDialog } from "./cancel-dialog";
import { RescheduleDialog, type ServiceTypeOption, type TechOption } from "./reschedule-dialog";

const selectCls = "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const TERMINAL: WorkStatus[] = ["complete rated", "complete unrated", "user canceled", "pro canceled"];
const STATUS_TARGETS = WORK_STATUSES.filter((s) => s !== "pending_cancellation");

function lockedReason(status: WorkStatus): string | null {
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

export function JobActions({
  jobId,
  addressId,
  status,
  serviceType,
  techId,
  serviceTypes,
  techs,
  todayIso,
  hasPendingRequest,
}: {
  jobId: string;
  addressId: string | null;
  status: WorkStatus;
  serviceType: string | null;
  techId: string | null;
  serviceTypes: ServiceTypeOption[];
  techs: TechOption[];
  todayIso: string;
  hasPendingRequest: boolean;
}) {
  const router = useRouter();
  const [tech, setTech] = useState(techId ?? "");
  const [nextStatus, setNextStatus] = useState<string>(status === "pending_cancellation" ? "scheduled" : status);
  const [assigning, startAssign] = useTransition();
  const [changing, startStatus] = useTransition();
  const terminal = TERMINAL.includes(status);

  const assign = () =>
    startAssign(async () => {
      const res = await assignJobAction(jobId, tech);
      if (res.ok) {
        toast.success("Tech reassigned");
        router.refresh();
      } else toast.error(res.message);
    });

  const changeStatus = () =>
    startStatus(async () => {
      const res = await setJobStatusAction(jobId, nextStatus);
      if (res.ok) {
        toast.success(`Status set to ${STATUS_LABEL[nextStatus as WorkStatus] ?? nextStatus}`);
        router.refresh();
      } else toast.error(res.message);
    });

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <RescheduleDialog
        jobId={jobId}
        addressId={addressId}
        currentServiceType={serviceType}
        currentTechId={techId}
        serviceTypes={serviceTypes}
        techs={techs}
        todayIso={todayIso}
        disabledReason={lockedReason(status)}
      />

      {!terminal ? (
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Reassign
          <span className="flex items-center gap-1.5">
            <select value={tech} onChange={(e) => setTech(e.target.value)} className={selectCls}>
              <option value="">Pick a tech…</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={assign} disabled={!tech || tech === techId || assigning}>
              {assigning ? "…" : "Apply"}
            </Button>
          </span>
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Status
        <span className="flex items-center gap-1.5">
          <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className={selectCls}>
            {STATUS_TARGETS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
                {s === "complete rated" ? " (rated)" : s === "complete unrated" ? " (unrated)" : ""}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={changeStatus} disabled={nextStatus === status || changing}>
            {changing ? "…" : "Apply"}
          </Button>
        </span>
      </label>

      {!terminal ? (
        <div className="ml-auto">
          <CancelDialog jobId={jobId} hasPendingRequest={hasPendingRequest} />
        </div>
      ) : null}
    </div>
  );
}
