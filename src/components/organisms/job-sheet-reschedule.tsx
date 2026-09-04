"use client";

import { useMemo, useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SlotButton } from "@/components/molecules/slot-button";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/atoms/ui/dialog";
import { Input } from "@/components/atoms/ui/input";
import { Label } from "@/components/atoms/ui/label";
import { findSlotsAction, rescheduleAction } from "@/app/today/actions";
import { BUSINESS_TZ } from "@/lib/time";
import { notBeforeToday } from "@/lib/ui/board-layout";
import { rescheduleLockedReason } from "@/lib/ui/job-status";
import type { BoardTech, JobSheetData, Run, Slot } from "@/lib/ui/board-types";

export type JobSheetRescheduleProps = {
  job: JobSheetData["job"];
  date: string;
  techs: BoardTech[];
  serviceTypes: JobSheetData["serviceTypes"];
  disabled: boolean;
  run: Run;
};

/** Opens the reschedule form in a modal: find open windows (or set one by hand) and move the job. */
export function JobSheetReschedule({ job, date, techs, serviceTypes, disabled, run }: JobSheetRescheduleProps) {
  const defaultType = (job.serviceType && serviceTypes.some((s) => s.id === job.serviceType) && job.serviceType) || "diagnostic";
  const currentTech = job.techs[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState(defaultType);
  const [techId, setTechId] = useState(currentTech);
  const [from, setFrom] = useState(notBeforeToday(date));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [reason, setReason] = useState("");
  const [freeform, setFreeform] = useState("");
  const lockedReason = rescheduleLockedReason(job.workStatus);

  const findSlots = async () => {
    setFinding(true);
    const r = await findSlotsAction({
      from,
      service_type: serviceType as JobSheetData["serviceTypes"][number]["id"] as never,
      preferred_employee_id: techId || undefined,
      address_id: job.addressId ?? undefined,
      priority: job.priority,
    });
    setFinding(false);
    if (r.ok) {
      setSlots(r.data);
      if (r.data.length === 0) toast.message("No open windows in that range");
    } else toast.error(r.error);
  };

  const submit = (window_start: string, employee_id: string | undefined) => {
    if (!reason.trim()) {
      toast.error("Add a reason for the reschedule");
      return;
    }
    run("Rescheduled", () => rescheduleAction({ job_id: job.id, new_window_start: window_start, employee_id, reason }), () => {
      setOpen(false);
      setSlots(null);
      setReason("");
      setFreeform("");
    });
  };

  const freeformIso = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(freeform)) return null;
    return fromZonedTime(`${freeform}:00`, BUSINESS_TZ).toISOString();
  }, [freeform]);

  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reschedule</div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Searching again on reopen is cheap; stale windows are not worth showing.
          if (!next) setSlots(null);
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" disabled={disabled || Boolean(lockedReason)} title={lockedReason ?? "Find a new window and tech"} />}>
          <CalendarClock data-icon="inline-start" />
          Reschedule
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reschedule visit</DialogTitle>
            <DialogDescription>Openings come from the same availability search the phone agent uses.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rs-type" className="text-sm">
                Service
              </Label>
              <NativeSelect id="rs-type" value={serviceType} onChange={(e) => setServiceType(e.target.value)} disabled={disabled}>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.durationMinutes}m
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rs-tech" className="text-sm">
                Tech
              </Label>
              <NativeSelect id="rs-tech" value={techId} onChange={(e) => setTechId(e.target.value)} disabled={disabled}>
                <option value="">Any tech</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rs-from" className="text-sm">
                From
              </Label>
              <Input id="rs-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={disabled} className="h-8 font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rs-reason" className="text-sm">
              Reason (goes in the job notes)
            </Label>
            <Input id="rs-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer asked to move it" disabled={disabled} className="h-8 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={findSlots} disabled={disabled || finding}>
              {finding && <Loader2 className="size-3.5 animate-spin" />}
              Find open windows
            </Button>
            <span className="text-xs text-muted-foreground">3 days from the date above, 2 h arrival windows</span>
          </div>
          {slots && slots.length === 0 && <p className="text-sm text-muted-foreground">No open windows. Try another tech or a later date.</p>}
          {slots && slots.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {slots.map((s) => (
                <li key={`${s.window_start}-${s.employee_id}`}>
                  <SlotButton slot={s} disabled={disabled} onPick={submit} />
                </li>
              ))}
            </ul>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Set a window by hand (ET)</summary>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="rs-free" className="text-sm">
                  Arrival window start
                </Label>
                <Input id="rs-free" type="datetime-local" step={3600} value={freeform} onChange={(e) => setFreeform(e.target.value)} disabled={disabled} className="h-8 font-mono text-sm" />
              </div>
              <Button type="button" size="sm" disabled={disabled || !freeformIso} onClick={() => freeformIso && submit(freeformIso, techId || undefined)}>
                Move
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Must start on the hour inside business hours; the slot is re-checked against the tech&apos;s day.</p>
          </details>
        </DialogContent>
      </Dialog>
      {lockedReason && <p className="text-sm text-muted-foreground">{lockedReason}</p>}
    </section>
  );
}
