"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookJobAction, findSlotsAction, type FindSlotsResult } from "@/app/addresses/actions";
import type { Slot } from "@/domain/availability";
import { fmtWindow } from "@/components/jobs/format";

export type BookJobDialogProps = {
  customerId: string;
  addressId: string;
  addressLabel: string;
  serviceTypes: { id: string; name: string; durationMinutes: number }[];
  techs: { id: string; name: string }[];
  /** yyyy-MM-dd in ET */
  defaultDate: string;
  minDate: string;
};

const selectCls = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const REASON_LABEL: Record<Slot["reason"], string> = {
  last_tech_here: "was here last",
  least_loaded: "lightest day",
  only_available: "only tech free",
};

/**
 * Office booking from the dossier page: pick service + date, ask
 * findAvailability for real openings, pick one, describe the issue, book.
 * Same domain call as the agent's book_job, actor = the signed-in user.
 */
export function BookJobDialog(props: BookJobDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState(props.serviceTypes[0]?.id ?? "diagnostic");
  const [priority, setPriority] = useState<"normal" | "high" | "emergency">("normal");
  const [date, setDate] = useState(props.defaultDate);
  const [days, setDays] = useState("3");
  const [preferred, setPreferred] = useState("");
  const [slots, setSlots] = useState<FindSlotsResult | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [issue, setIssue] = useState("");
  const [callerName, setCallerName] = useState("");
  const [callerPhone, setCallerPhone] = useState("");
  const [access, setAccess] = useState("");
  const [booked, setBooked] = useState<{ job_id: string; line: string } | null>(null);
  const [searching, startSearch] = useTransition();
  const [booking, startBook] = useTransition();

  function reset() {
    setSlots(null);
    setPicked(null);
    setIssue("");
    setCallerName("");
    setCallerPhone("");
    setAccess("");
    setBooked(null);
    setPriority("normal");
    setDate(props.defaultDate);
  }

  function search() {
    setPicked(null);
    startSearch(async () => {
      const to = addDays(date, Math.max(0, Number(days) - 1));
      const r = await findSlotsAction({
        from: date,
        to,
        service_type: serviceType as never,
        priority,
        preferred_employee_id: preferred || undefined,
        address_id: props.addressId,
        limit: 8,
      });
      if (!r.ok) {
        toast.error(r.message);
        setSlots(null);
        return;
      }
      setSlots(r.result);
      if (r.result.slots.length === 0) toast.message("No openings in that range", { description: "Try a later date, a different service type or no preferred tech." });
    });
  }

  function book() {
    if (!picked) return;
    startBook(async () => {
      const r = await bookJobAction({
        customer_id: props.customerId,
        address_id: props.addressId,
        service_type: serviceType as never,
        window_start: picked.window_start,
        employee_id: picked.employee_id,
        issue_summary: issue,
        priority,
        caller_name: callerName || undefined,
        caller_phone: callerPhone || undefined,
        access_notes: access || undefined,
      });
      if (!r.ok) {
        toast.error(r.message);
        if (r.code === "slot_taken") search();
        return;
      }
      setBooked({ job_id: r.result.job_id, line: r.result.confirmation_line });
      toast.success(`Booked #${r.result.invoice_number}`, { description: r.result.window_label + " with " + r.result.employee_name });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger render={<Button size="default" />}>
        <CalendarPlus data-icon="inline-start" />
        Book a job
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Book a job</DialogTitle>
          <DialogDescription>{props.addressLabel}</DialogDescription>
        </DialogHeader>

        {booked ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">{booked.line}</p>
            <div className="flex gap-2">
              <Button nativeButton={false} render={<Link href={`/jobs/${booked.job_id}`} />}>
                Open job
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="bk-service">Service</Label>
                <select id="bk-service" className={selectCls} value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                  {props.serviceTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMinutes >= 60 ? `${s.durationMinutes / 60} h` : `${s.durationMinutes} min`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bk-priority">Priority</Label>
                <select id="bk-priority" className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bk-tech">Prefer tech</Label>
                <select id="bk-tech" className={selectCls} value={preferred} onChange={(e) => setPreferred(e.target.value)}>
                  <option value="">Any</option>
                  {props.techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="bk-date">From</Label>
                <Input id="bk-date" type="date" min={props.minDate} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bk-days">Days</Label>
                <select id="bk-days" className={selectCls} value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="1">Just that day</option>
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" className="w-full" onClick={search} disabled={searching || !date}>
                  {searching ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                  Find openings
                </Button>
              </div>
            </div>

            {slots ? (
              <fieldset className="space-y-1">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">
                  Openings {slots.slots.length ? `(${slots.slots.length})` : ""}
                  {slots.closed_days.length ? <span className="ml-2 font-normal">closed: {slots.closed_days.join(", ")}</span> : null}
                </legend>
                {slots.slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No openings in that range.</p>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {slots.slots.map((s) => {
                      const id = `${s.window_start}|${s.employee_id}`;
                      const active = picked && `${picked.window_start}|${picked.employee_id}` === id;
                      return (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${active ? "border-ring bg-accent" : "hover:bg-muted/60"}`}
                        >
                          <input type="radio" name="slot" className="mt-1" checked={Boolean(active)} onChange={() => setPicked(s)} />
                          <span className="min-w-0">
                            <span className="block font-medium tabular-nums">{fmtWindow(s.window_start, s.window_end)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {s.employee_name} · {REASON_LABEL[s.reason]}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="bk-issue">Issue</Label>
              <Textarea id="bk-issue" rows={2} placeholder="What the customer reported, in one or two lines" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bk-caller">Caller name</Label>
                <Input id="bk-caller" value={callerName} onChange={(e) => setCallerName(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bk-phone">Caller phone</Label>
                <Input id="bk-phone" value={callerPhone} onChange={(e) => setCallerPhone(e.target.value)} placeholder="optional, saved to the customer" inputMode="tel" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bk-access">Access notes</Label>
              <Input id="bk-access" value={access} onChange={(e) => setAccess(e.target.value)} placeholder="gate, lockbox, who to call on arrival (optional)" />
            </div>
          </div>
        )}

        {!booked ? (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} type="button">
              Cancel
            </Button>
            <Button onClick={book} disabled={booking || !picked || issue.trim().length < 3} type="button">
              {booking ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {picked ? `Book with ${picked.employee_name.split(" ")[0]}` : "Pick an opening"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function addDays(yyyyMmDd: string, n: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
