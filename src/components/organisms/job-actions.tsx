"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignJobAction, setJobStatusAction } from "@/app/jobs/actions";
import { FormField } from "@/components/atoms/form-field";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { CancelDialog } from "@/components/organisms/cancel-dialog";
import { RescheduleDialog } from "@/components/organisms/reschedule-dialog";
import type { WorkStatus } from "@/lib/job-constants";
import type { ServiceTypeOption, TechOption } from "@/lib/ui/job-options";
import { STATUS_LABEL, STATUS_TARGETS, initialStatusTarget, isTerminalStatus, rescheduleLockedReason, statusOptionLabel } from "@/lib/ui/job-status";

const APPLY_LABEL = { busy: "…", idle: "Apply" } as const;

export type JobActionsProps = {
  jobId: string;
  addressId: string | null;
  status: WorkStatus;
  serviceType: string | null;
  techId: string | null;
  serviceTypes: ServiceTypeOption[];
  techs: TechOption[];
  todayIso: string;
  hasPendingRequest: boolean;
};

/** Reschedule · Reassign · Status · Cancel — the office controls for one job. */
export function JobActions({ jobId, addressId, status, serviceType, techId, serviceTypes, techs, todayIso, hasPendingRequest }: JobActionsProps) {
  const router = useRouter();
  const [tech, setTech] = useState(techId ?? "");
  const [nextStatus, setNextStatus] = useState<string>(initialStatusTarget(status));
  const [assigning, startAssign] = useTransition();
  const [changing, startStatus] = useTransition();
  const terminal = isTerminalStatus(status);

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
        disabledReason={rescheduleLockedReason(status)}
      />

      {!terminal && (
        <FormField variant="wrapping" label="Reassign">
          <span className="flex items-center gap-1.5">
            <NativeSelect value={tech} onChange={(e) => setTech(e.target.value)} className="w-auto dark:bg-input/30">
              <option value="">Pick a tech…</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="button" size="sm" variant="outline" onClick={assign} disabled={!tech || tech === techId || assigning}>
              {APPLY_LABEL[(assigning && "busy") || "idle"]}
            </Button>
          </span>
        </FormField>
      )}

      <FormField variant="wrapping" label="Status">
        <span className="flex items-center gap-1.5">
          <NativeSelect value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="w-auto dark:bg-input/30">
            {STATUS_TARGETS.map((s) => (
              <option key={s} value={s}>
                {statusOptionLabel(s)}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" size="sm" variant="outline" onClick={changeStatus} disabled={nextStatus === status || changing}>
            {APPLY_LABEL[(changing && "busy") || "idle"]}
          </Button>
        </span>
      </FormField>

      {!terminal && (
        <div className="ml-auto">
          <CancelDialog jobId={jobId} hasPendingRequest={hasPendingRequest} />
        </div>
      )}
    </div>
  );
}
