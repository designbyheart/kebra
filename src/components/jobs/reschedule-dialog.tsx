"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { findSlotsAction, rescheduleJobAction } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Slot } from "@/domain/availability";
import { shiftIsoDate } from "./job-filter-params";

export type ServiceTypeOption = { id: string; name: string; durationMinutes: number };
export type TechOption = { id: string; name: string };

const selectCls = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const REASON_LABEL: Record<Slot["reason"], string> = {
  last_tech_here: "last tech here",
  least_loaded: "least loaded",
  only_available: "only one free",
};

export function RescheduleDialog({
  jobId,
  addressId,
  currentServiceType,
  currentTechId,
  serviceTypes,
  techs,
  todayIso,
  disabledReason,
}: {
  jobId: string;
  addressId: string | null;
  currentServiceType: string | null;
  currentTechId: string | null;
  serviceTypes: ServiceTypeOption[];
  techs: TechOption[];
  todayIso: string;
  /** when set, the button is disabled with this title */
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState(currentServiceType && serviceTypes.some((s) => s.id === currentServiceType) ? currentServiceType : "diagnostic");
  const [date, setDate] = useState(shiftIsoDate(todayIso, 1));
  const [preferred, setPreferred] = useState(currentTechId ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [closed, setClosed] = useState<string[]>([]);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  const search = () =>
    startSearch(async () => {
      setPicked(null);
      const res = await findSlotsAction({
        from: date,
        to: shiftIsoDate(date, 6),
        service_type: serviceType,
        preferred_employee_id: preferred || undefined,
        address_id: addressId ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.message);
        setSlots([]);
        return;
      }
      setSlots(res.result.slots);
      setClosed(res.result.closed_days);
    });

  const confirm = () => {
    if (!picked) return;
    startSave(async () => {
      const res = await rescheduleJobAction({ job_id: jobId, new_window_start: picked.window_start, employee_id: picked.employee_id, reason });
      if (res.ok) {
        toast.success(`Moved to ${res.result.new_window_label} with ${res.result.employee_name}`);
        setOpen(false);
        setSlots(null);
        setReason("");
        router.refresh();
      } else toast.error(res.message);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={Boolean(disabledReason)} title={disabledReason ?? "Find a new window and tech"} />}
      >
        <CalendarClock data-icon="inline-start" />
        Reschedule
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule visit</DialogTitle>
          <DialogDescription>Openings come from the same availability search the phone agent uses.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Service
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className={selectCls}>
              {serviceTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            From
            <Input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Prefer tech
            <select value={preferred} onChange={(e) => setPreferred(e.target.value)} className={selectCls}>
              <option value="">Anyone</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="secondary" onClick={search} disabled={searching || !date}>
            {searching ? "Searching…" : "Find openings"}
          </Button>
          {closed.length ? <span className="text-xs text-muted-foreground">Closed: {closed.join(", ")}</span> : null}
        </div>

        {slots ? (
          slots.length ? (
            <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
              <legend className="sr-only">Openings</legend>
              {slots.map((s) => {
                const key = `${s.window_start}|${s.employee_id}`;
                const active = picked && `${picked.window_start}|${picked.employee_id}` === key;
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${active ? "bg-accent" : ""}`}
                  >
                    <input type="radio" name="slot" checked={Boolean(active)} onChange={() => setPicked(s)} className="accent-foreground" />
                    <span className="flex-1">{s.window_label}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.employee_name} · {REASON_LABEL[s.reason]}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No openings in that week. Try another start date or service.</p>
          )
        ) : null}

        <label className="flex flex-col gap-1 text-xs font-medium">
          Reason (goes in the notes)
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Customer asked to move it; tech out sick; …" className="min-h-14" />
        </label>

        <DialogFooter showCloseButton>
          <Button type="button" size="sm" onClick={confirm} disabled={!picked || !reason.trim() || saving}>
            {saving ? "Moving…" : picked ? `Move to ${picked.window_label}` : "Pick an opening"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
