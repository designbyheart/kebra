"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { fromZonedTime } from "date-fns-tz";
import { AlertTriangle, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BUSINESS_TZ, formatDateTimeET, formatWindow } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  addNoteAction,
  cancelAction,
  findSlotsAction,
  getJobDetailAction,
  reassignAction,
  rescheduleAction,
  setStatusAction,
} from "@/app/today/actions";
import { relativeTime, todayET } from "./layout";
import { AGENT_BADGE, NOTE_AUTHOR_LABEL, OFFICE_SETTABLE, PRIORITY_STYLE, statusStyle } from "./status";
import type { ActionResult, BoardTech, JobSheetData, Slot } from "./types";

const SELECT_CLS =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

type Props = {
  jobId: string | null;
  date: string;
  techs: BoardTech[];
  /** Bump to reload the open job (a live event touched it). */
  refreshToken: number;
  onClose: () => void;
  onChanged: () => void;
};

export function JobSheet({ jobId, date, techs, refreshToken, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<JobSheetData | null>(null);
  const [loadError, setLoadError] = useState<{ jobId: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Derived, not synced: only the detail for the *open* job counts; anything else is "loading".
  const current = detail && detail.job.id === jobId ? detail : null;
  const currentError = loadError && loadError.jobId === jobId ? loadError.message : null;
  const loading = Boolean(jobId) && !current && !currentError;

  const applyResult = useCallback((id: string, r: ActionResult<JobSheetData>) => {
    if (r.ok) {
      setDetail(r.data);
      setLoadError(null);
    } else {
      setLoadError({ jobId: id, message: r.error });
    }
  }, []);
  const load = useCallback((id: string) => getJobDetailAction(id).then((r) => applyResult(id, r)), [applyResult]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    void getJobDetailAction(jobId).then((r) => {
      if (live) applyResult(jobId, r);
    });
    return () => {
      live = false;
    };
  }, [jobId, refreshToken, applyResult]);

  /** Run a write, toast, reload the sheet and tell the board. */
  const run = useCallback(
    (label: string, fn: () => Promise<ActionResult<unknown>>, after?: () => void) => {
      startTransition(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(label);
          after?.();
          if (jobId) await load(jobId);
          onChanged();
        } else {
          toast.error(r.error);
        }
      });
    },
    [jobId, load, onChanged],
  );

  const job = current?.job ?? null;
  const st = job ? statusStyle(job.workStatus) : null;

  return (
    <Sheet open={Boolean(jobId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" aria-busy={loading || pending}>
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading job…
          </div>
        ) : null}
        {!job && currentError ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Could not load job</SheetTitle>
              <SheetDescription>{currentError}</SheetDescription>
            </SheetHeader>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!jobId) return;
                setLoadError(null);
                void load(jobId);
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {job && st ? (
          <>
            <SheetHeader className="border-b pr-12">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 font-medium", st.chip)} style={st.style}>
                  <span className={cn("size-1.5 rounded-full", st.dot)} aria-hidden />
                  {st.label}
                </span>
                {PRIORITY_STYLE[job.priority].show ? (
                  <span className={cn("inline-flex items-center gap-1 font-medium", PRIORITY_STYLE[job.priority].text)}>
                    <Flag className="size-3" fill="currentColor" /> {PRIORITY_STYLE[job.priority].label}
                  </span>
                ) : null}
                {job.source === "agent" ? <Badge className={AGENT_BADGE}>Agent</Badge> : null}
                {job.source === "office" ? <Badge variant="outline">Office</Badge> : null}
                {job.invoiceNumber ? <span className="ml-auto font-mono text-muted-foreground">#{job.invoiceNumber}</span> : null}
              </div>
              <SheetTitle className="mt-1">{job.customerName}</SheetTitle>
              <SheetDescription>{job.addressLabel ?? "No service address on file"}</SheetDescription>
              <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Window</dt>
                <dd className="font-medium">
                  {job.scheduledStart
                    ? formatWindow(job.scheduledStart, new Date(new Date(job.scheduledStart).getTime() + (job.arrivalWindow || 120) * 60_000))
                    : "Not scheduled"}
                  {job.scheduledStart && job.scheduledEnd ? (
                    <span className="ml-1 font-normal text-muted-foreground">(ends {formatDateTimeET(job.scheduledEnd).replace(/^.*?, \d{4} /, "")})</span>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">Tech</dt>
                <dd className="font-medium">{job.techs.length ? job.techs.map((t) => t.name).join(", ") : <span className="text-muted-foreground">Unassigned</span>}</dd>
                <dt className="text-muted-foreground">Work</dt>
                <dd>{job.description?.trim() || <span className="text-muted-foreground">No description</span>}</dd>
                {job.serviceType ? (
                  <>
                    <dt className="text-muted-foreground">Service</dt>
                    <dd className="capitalize">{job.serviceType}</dd>
                  </>
                ) : null}
                {job.tags.length ? (
                  <>
                    <dt className="text-muted-foreground">Tags</dt>
                    <dd className="flex flex-wrap gap-1">
                      {job.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="h-4 px-1.5 text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </dd>
                  </>
                ) : null}
                {job.outstandingBalance > 0 ? (
                  <>
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="font-medium text-orange-700 dark:text-orange-400">${(job.outstandingBalance / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} outstanding</dd>
                  </>
                ) : null}
              </dl>
              <div className="mt-2 flex gap-3 text-xs">
                <Link href={`/jobs/${job.id}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Open job page
                </Link>
                <Link href={`/customers/${job.customerId}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Customer
                </Link>
              </div>
            </SheetHeader>

            {job.workStatus === "pending_cancellation" && current?.pendingCancellation ? (
              <PendingBanner p={current.pendingCancellation} />
            ) : null}

            <div className="flex flex-col gap-5 p-4">
              <NotesSection key={job.id} notes={current!.notes} disabled={pending} onAdd={(text, reset) => run("Note added", () => addNoteAction(job.id, text), reset)} />
              <Separator />
              <RescheduleSection key={`rs:${job.id}:${job.workStatus}`} job={job} date={date} techs={techs} serviceTypes={current!.serviceTypes} disabled={pending} run={run} />
              <Separator />
              {/* Keyed on the current tech / status so local form state resets when the job changes underneath. */}
              <ReassignSection key={`${job.id}:${job.techs[0]?.id ?? ""}`} job={job} techs={techs} disabled={pending} run={run} />
              <Separator />
              <StatusSection key={`st:${job.id}:${job.workStatus}`} job={job} disabled={pending} run={run} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function PendingBanner({ p }: { p: NonNullable<JobSheetData["pendingCancellation"]> }) {
  return (
    <div
      className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50"
      style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in oklch, var(--color-red-500) 10%, transparent) 8px 16px)" }}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Cancellation requested {relativeTime(p.requestedAt)}</div>
        {p.reason ? <div className="mt-0.5">Reason: {p.reason}</div> : null}
        <div className="mt-1 flex gap-3">
          <Link href={p.taskId ? `/inbox?task=${encodeURIComponent(p.taskId)}` : "/inbox"} className="font-medium underline underline-offset-2">
            Approve or reject in Inbox →
          </Link>
          {p.callId ? (
            <Link href={`/calls/${encodeURIComponent(p.callId)}`} className="underline underline-offset-2">
              View call
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NotesSection({ notes, disabled, onAdd }: { notes: JobSheetData["notes"]; disabled: boolean; onAdd: (text: string, reset: () => void) => void }) {
  const [text, setText] = useState("");
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes ({notes.length})</h3>
      {notes.length === 0 ? <p className="text-xs text-muted-foreground">No notes yet.</p> : null}
      <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {n.authorType === "agent" ? <Badge className={cn("h-4 px-1.5 text-[9px] uppercase", AGENT_BADGE)}>Agent</Badge> : <span className="font-medium text-foreground">{NOTE_AUTHOR_LABEL[n.authorType] ?? n.authorType}</span>}
              <span title={formatDateTimeET(n.createdAt)}>{formatDateTimeET(n.createdAt).replace(/ [A-Z]{3,4}$/, "")}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{n.content}</p>
          </li>
        ))}
      </ol>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAdd(text, () => setText(""));
        }}
      >
        <Label htmlFor="new-note" className="sr-only">
          Add a note
        </Label>
        <Textarea id="new-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the tech or the office…" rows={2} disabled={disabled} className="text-sm" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={disabled || !text.trim()}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}

type Run = (label: string, fn: () => Promise<ActionResult<unknown>>, after?: () => void) => void;

function RescheduleSection({
  job,
  date,
  techs,
  serviceTypes,
  disabled,
  run,
}: {
  job: JobSheetData["job"];
  date: string;
  techs: BoardTech[];
  serviceTypes: JobSheetData["serviceTypes"];
  disabled: boolean;
  run: Run;
}) {
  const defaultType = job.serviceType && serviceTypes.some((s) => s.id === job.serviceType) ? job.serviceType : "diagnostic";
  const currentTech = job.techs[0]?.id ?? "";
  const [serviceType, setServiceType] = useState(defaultType);
  const [techId, setTechId] = useState(currentTech);
  const [from, setFrom] = useState(date < todayET() ? todayET() : date);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [reason, setReason] = useState("");
  const [freeform, setFreeform] = useState("");
  const locked = !(job.workStatus === "scheduled" || job.workStatus === "needs scheduling");

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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reschedule</h3>
      {locked ? <p className="text-xs text-muted-foreground">Only scheduled or needs-scheduling jobs can be moved (this one is {job.workStatus}).</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor="rs-type" className="text-[11px]">
            Service
          </Label>
          <select id="rs-type" className={SELECT_CLS} value={serviceType} onChange={(e) => setServiceType(e.target.value)} disabled={disabled || locked}>
            {serviceTypes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes}m
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-tech" className="text-[11px]">
            Tech
          </Label>
          <select id="rs-tech" className={SELECT_CLS} value={techId} onChange={(e) => setTechId(e.target.value)} disabled={disabled || locked}>
            <option value="">Any tech</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rs-from" className="text-[11px]">
            From
          </Label>
          <Input id="rs-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={disabled || locked} className="h-8 font-mono text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rs-reason" className="text-[11px]">
          Reason (goes in the job notes)
        </Label>
        <Input id="rs-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer asked to move it" disabled={disabled || locked} className="h-8 text-sm" />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={findSlots} disabled={disabled || locked || finding}>
          {finding ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Find open windows
        </Button>
        <span className="text-[11px] text-muted-foreground">3 days from the date above, 2 h arrival windows</span>
      </div>
      {slots ? (
        slots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open windows. Try another tech or a later date.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {slots.map((s) => (
              <li key={`${s.window_start}-${s.employee_id}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => submit(s.window_start, s.employee_id)}
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:border-ring hover:bg-muted disabled:opacity-50"
                >
                  <div className="font-medium">{formatWindow(s.window_start, s.window_end)}</div>
                  <div className="text-muted-foreground">
                    {s.employee_name}
                    {s.reason === "last_tech_here" ? " · was here last" : s.reason === "least_loaded" ? " · lightest day" : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Set a window by hand (ET)</summary>
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="rs-free" className="text-[11px]">
              Arrival window start
            </Label>
            <Input id="rs-free" type="datetime-local" step={3600} value={freeform} onChange={(e) => setFreeform(e.target.value)} disabled={disabled || locked} className="h-8 font-mono text-xs" />
          </div>
          <Button type="button" size="sm" disabled={disabled || locked || !freeformIso} onClick={() => freeformIso && submit(freeformIso, techId || undefined)}>
            Move
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Must start on the hour inside business hours; the slot is re-checked against the tech&apos;s day.</p>
      </details>
    </section>
  );
}

function ReassignSection({ job, techs, disabled, run }: { job: JobSheetData["job"]; techs: BoardTech[]; disabled: boolean; run: Run }) {
  const current = job.techs[0]?.id ?? "";
  const [techId, setTechId] = useState(current);
  const terminal = ["complete rated", "complete unrated", "user canceled", "pro canceled"].includes(job.workStatus);
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reassign tech</h3>
      <div className="flex items-center gap-2">
        <select aria-label="Tech" className={SELECT_CLS} value={techId} onChange={(e) => setTechId(e.target.value)} disabled={disabled || terminal}>
          <option value="" disabled>
            Choose a tech
          </option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={disabled || terminal || !techId || techId === current} onClick={() => run("Tech reassigned", () => reassignAction(job.id, techId))}>
          Reassign
        </Button>
      </div>
      {terminal ? <p className="text-[11px] text-muted-foreground">Closed jobs cannot be reassigned.</p> : null}
    </section>
  );
}

function StatusSection({ job, disabled, run }: { job: JobSheetData["job"]; disabled: boolean; run: Run }) {
  const [status, setStatus] = useState<string>(job.workStatus);
  const [note, setNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const canceled = job.workStatus === "user canceled" || job.workStatus === "pro canceled";
  const options = OFFICE_SETTABLE.includes(job.workStatus) ? OFFICE_SETTABLE : [job.workStatus, ...OFFICE_SETTABLE];
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</h3>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select aria-label="New status" className={SELECT_CLS} value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled}>
          {options.map((s) => (
            <option key={s} value={s}>
              {statusStyle(s).label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={disabled || status === job.workStatus} onClick={() => run(`Status set to ${statusStyle(status as JobSheetData["job"]["workStatus"]).label.toLowerCase()}`, () => setStatusAction(job.id, status, note), () => setNote(""))}>
          Apply
        </Button>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" disabled={disabled} className="col-span-2 h-8 text-sm" />
      </div>
      {!canceled ? (
        <div className="rounded-md border border-dashed p-2.5">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Cancel this job</div>
          <div className="flex items-center gap-2">
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" disabled={disabled} className="h-8 text-sm" />
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={disabled || !cancelReason.trim()}
              onClick={() => {
                if (!window.confirm(`Cancel job ${job.invoiceNumber ? `#${job.invoiceNumber}` : ""} for ${job.customerName}?`)) return;
                run("Job canceled", () => cancelAction(job.id, cancelReason), () => setCancelReason(""));
              }}
            >
              Cancel job
            </Button>
          </div>
          {job.workStatus === "pending_cancellation" ? <p className="mt-1 text-[11px] text-muted-foreground">This also approves the pending request.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
