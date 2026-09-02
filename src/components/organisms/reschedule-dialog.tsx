"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { findSlotsAction, rescheduleJobAction } from "@/app/jobs/actions";
import { FormField } from "@/components/atoms/form-field";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/atoms/ui/dialog";
import { Input } from "@/components/atoms/ui/input";
import { Textarea } from "@/components/atoms/ui/textarea";
import { SlotRadioList } from "@/components/molecules/slot-radio-list";
import type { Slot } from "@/domain/availability";
import { shiftIsoDate } from "@/lib/ui/job-filter-params";
import { initialServiceType, rescheduleConfirmLabel, type ServiceTypeOption, type TechOption } from "@/lib/ui/job-options";

const SEARCH_LABEL = { searching: "Searching…", idle: "Find openings" } as const;

export type RescheduleDialogProps = {
  jobId: string;
  addressId: string | null;
  currentServiceType: string | null;
  currentTechId: string | null;
  serviceTypes: ServiceTypeOption[];
  techs: TechOption[];
  todayIso: string;
  /** when set, the button is disabled with this title */
  disabledReason?: string | null;
};

/** Find a new window with the agent's availability search and move the visit. */
export function RescheduleDialog({ jobId, addressId, currentServiceType, currentTechId, serviceTypes, techs, todayIso, disabledReason }: RescheduleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState(initialServiceType(currentServiceType, serviceTypes));
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
          <FormField variant="plain" label="Service">
            <NativeSelect value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="dark:bg-input/30">
              {serviceTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMinutes} min
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField variant="plain" label="From">
            <Input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField variant="plain" label="Prefer tech">
            <NativeSelect value={preferred} onChange={(e) => setPreferred(e.target.value)} className="dark:bg-input/30">
              <option value="">Anyone</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="secondary" onClick={search} disabled={searching || !date}>
            {SEARCH_LABEL[(searching && "searching") || "idle"]}
          </Button>
          {closed.length > 0 && <span className="text-xs text-muted-foreground">Closed: {closed.join(", ")}</span>}
        </div>

        {slots && <SlotRadioList slots={slots} picked={picked} onPick={setPicked} />}

        <FormField variant="plain" label="Reason (goes in the notes)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Customer asked to move it; tech out sick; …" className="min-h-14" />
        </FormField>

        <DialogFooter showCloseButton>
          <Button type="button" size="sm" onClick={confirm} disabled={!picked || !reason.trim() || saving}>
            {rescheduleConfirmLabel(saving, picked)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
