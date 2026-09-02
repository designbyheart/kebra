/**
 * Job writes (W1-B): book, reschedule, and the office-side helpers the UI
 * calls (cancel, assign, set status). Contract: docs/TOOLS.md `book_job`,
 * `reschedule_job`; events per docs/EVENTS.md. Every function runs in one
 * transaction and emits exactly one event (see ./idempotency `runWrite`).
 */
import { addMinutes, differenceInMinutes } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import {
  addresses,
  customerPhones,
  customers,
  employees,
  jobAssignments,
  jobs,
  notes,
  workStatusEnum,
  changeRequests,
  tasks,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { ToolError } from "@/agent/errors";
import {
  ARRIVAL_WINDOW_MIN,
  SCHEDULABLE_ROLE,
  firstName,
  isTechFree,
  isWithinHours,
  loadHours,
  loadServiceType,
  loadTech,
  parseDateInput,
  spokenDay,
  windowLabel,
  type Exec,
} from "./availability";
import { actorId, actorLabelFor, resolveCallId, runWrite, type Tx, type WriteActor } from "./idempotency";

export type WorkStatus = (typeof workStatusEnum.enumValues)[number];
export const WORK_STATUSES = workStatusEnum.enumValues;
const OPEN_FOR_CHANGE: WorkStatus[] = ["scheduled", "needs scheduling"];
const TERMINAL: WorkStatus[] = ["complete rated", "complete unrated", "user canceled", "pro canceled"];

// ---------------------------------------------------------------------------
// Shared read helpers
// ---------------------------------------------------------------------------

export type JobDetail = {
  id: string;
  invoiceNumber: string | null;
  description: string | null;
  workStatus: WorkStatus;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  arrivalWindow: number | null;
  customerId: string;
  customerName: string;
  addressId: string | null;
  addressLabel: string | null;
  serviceType: string | null;
  priority: "normal" | "high" | "emergency";
  techs: { id: string; name: string; role: string }[];
};

export function addressLabelOf(a: { street: string; unit: string | null; city: string | null }): string {
  return [a.street, a.unit ? (/^(unit|apt|suite|ste|bldg)\b/i.test(a.unit) ? a.unit : `Unit ${a.unit}`) : null, a.city]
    .filter(Boolean)
    .join(", ");
}

export async function loadJobDetail(exec: Exec, jobId: string): Promise<JobDetail | null> {
  const [j] = await exec
    .select({
      id: jobs.id,
      invoiceNumber: jobs.invoiceNumber,
      description: jobs.description,
      workStatus: jobs.workStatus,
      scheduledStart: jobs.scheduledStart,
      scheduledEnd: jobs.scheduledEnd,
      arrivalWindow: jobs.arrivalWindow,
      customerId: jobs.customerId,
      customerName: customers.displayName,
      addressId: jobs.addressId,
      street: addresses.street,
      unit: addresses.unit,
      city: addresses.city,
      serviceType: jobs.serviceType,
      priority: jobs.priority,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!j) return null;
  const techs = await exec
    .select({ id: employees.id, first: employees.firstName, last: employees.lastName, role: employees.role })
    .from(jobAssignments)
    .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
    .where(eq(jobAssignments.jobId, jobId));
  return {
    id: j.id,
    invoiceNumber: j.invoiceNumber,
    description: j.description,
    workStatus: j.workStatus,
    scheduledStart: j.scheduledStart,
    scheduledEnd: j.scheduledEnd,
    arrivalWindow: j.arrivalWindow,
    customerId: j.customerId,
    customerName: j.customerName,
    addressId: j.addressId,
    addressLabel: j.street ? addressLabelOf({ street: j.street, unit: j.unit, city: j.city }) : null,
    serviceType: j.serviceType,
    priority: j.priority,
    techs: techs.map((t) => ({ id: t.id, name: `${t.first} ${t.last}`.trim(), role: t.role })),
  };
}

export async function requireJob(exec: Exec, jobId: string): Promise<JobDetail> {
  const j = await loadJobDetail(exec, jobId);
  if (!j) {
    throw new ToolError("not_found", `job ${jobId} not found`, "I can't find that visit. Could you give me the address again?");
  }
  return j;
}

/** The field tech on a job (first one), if any. */
export function primaryTech(j: JobDetail): { id: string; name: string } | null {
  return j.techs.find((t) => t.role === SCHEDULABLE_ROLE) ?? j.techs[0] ?? null;
}

/** Job length in minutes: service type → stored window → arrival window. */
export async function jobDurationMinutes(exec: Exec, j: JobDetail): Promise<number> {
  if (j.serviceType) {
    try {
      return (await loadServiceType(exec, j.serviceType)).durationMinutes;
    } catch {
      /* fall through */
    }
  }
  if (j.scheduledStart && j.scheduledEnd) {
    return Math.max(30, differenceInMinutes(j.scheduledEnd, j.scheduledStart));
  }
  return ARRIVAL_WINDOW_MIN;
}

export function windowOf(j: JobDetail): { start: Date; end: Date } | null {
  if (!j.scheduledStart) return null;
  return { start: j.scheduledStart, end: addMinutes(j.scheduledStart, j.arrivalWindow || ARRIVAL_WINDOW_MIN) };
}

export function windowLabelOf(j: JobDetail): string | null {
  const w = windowOf(j);
  return w ? windowLabel(w.start, w.end) : null;
}

export async function appendNote(
  tx: Tx,
  input: { jobId: string; content: string; authorType: "tech" | "office" | "agent" | "system"; authorId?: string | null },
): Promise<{ id: string; seq: number }> {
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${notes.seq}), 0) + 1` })
    .from(notes)
    .where(eq(notes.jobId, input.jobId));
  const id = newId("nte");
  await tx.insert(notes).values({
    id,
    jobId: input.jobId,
    content: input.content,
    authorType: input.authorType,
    authorId: input.authorId ?? null,
    seq: Number(next),
  });
  return { id, seq: Number(next) };
}

/** Next invoice number = max(numeric invoice numbers) + 1, serialised on an advisory lock. */
export async function nextInvoiceNumber(tx: Tx): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('kebra:invoice_number'))`);
  const [{ next }] = await tx
    .select({ next: sql<string>`(coalesce(max(${jobs.invoiceNumber}::int), 0) + 1)::text` })
    .from(jobs)
    .where(sql`${jobs.invoiceNumber} ~ '^[0-9]+$'`);
  return String(next);
}

function noteAuthor(who: WriteActor): "office" | "agent" | "system" {
  return who.actor;
}

async function lockTech(tx: Tx, employeeId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tech:${employeeId}`}))`);
}

async function assertSlot(tx: Tx, employeeId: string, techName: string, start: Date, durationMin: number, now: Date, excludeJobId?: string) {
  if (start <= now) {
    throw new ToolError("outside_hours", "window start is in the past", "That time has already passed. Want me to look for the next opening?", {
      window_start: start.toISOString(),
    });
  }
  const hours = await loadHours(tx);
  if (!isWithinHours(start, hours, durationMin)) {
    throw new ToolError(
      "outside_hours",
      "window start is outside business hours or not on the hour",
      "That time is outside our service hours. I can check the next available window if you like.",
      { window_start: start.toISOString() },
    );
  }
  await lockTech(tx, employeeId);
  if (!(await isTechFree(tx, employeeId, start, durationMin, excludeJobId))) {
    throw new ToolError(
      "slot_taken",
      `${employeeId} is no longer free at ${start.toISOString()}`,
      `I'm sorry, ${firstName(techName)} just got booked for that time. Let me look for another opening.`,
      { employee_id: employeeId, window_start: start.toISOString() },
    );
  }
}

// ---------------------------------------------------------------------------
// bookJob
// ---------------------------------------------------------------------------

export type BookJobInput = {
  customer_id: string;
  address_id: string;
  service_type: string;
  window_start: string;
  employee_id: string;
  issue_summary: string;
  priority?: "normal" | "high" | "emergency";
  caller_name?: string;
  caller_phone?: string;
  access_notes?: string;
  idempotency_key?: string;
  now?: Date;
};

export type BookJobResult = {
  job_id: string;
  invoice_number: string;
  window_start: string;
  window_end: string;
  window_label: string;
  employee_id: string;
  employee_name: string;
  confirmation_line: string;
  speech_hint: string;
  [k: string]: unknown;
};

export async function bookJob(input: BookJobInput, who: WriteActor): Promise<BookJobResult> {
  const now = input.now ?? new Date();
  return runWrite<BookJobResult>({
    tool: "book_job",
    idempotencyKey: input.idempotency_key,
    execute: async (tx) => {
      const [cust] = await tx
        .select({ id: customers.id, name: customers.displayName })
        .from(customers)
        .where(eq(customers.id, input.customer_id))
        .limit(1);
      if (!cust) {
        throw new ToolError("not_found", `customer ${input.customer_id} not found`, "I lost the customer record. Let me look you up again.");
      }
      const [addr] = await tx
        .select({ id: addresses.id, customerId: addresses.customerId, street: addresses.street, unit: addresses.unit, city: addresses.city })
        .from(addresses)
        .where(eq(addresses.id, input.address_id))
        .limit(1);
      if (!addr) {
        throw new ToolError("not_found", `address ${input.address_id} not found`, "I lost the service address. Could you give it to me once more?");
      }
      if (addr.customerId !== cust.id) {
        throw new ToolError(
          "validation",
          "address does not belong to customer",
          "That address is under a different account. Let me double-check which one we're booking for.",
          { address_id: addr.id, customer_id: cust.id },
        );
      }
      const tech = await loadTech(tx, input.employee_id);
      if (!tech) {
        throw new ToolError("not_found", `employee ${input.employee_id} is not a schedulable tech`, "That technician isn't on the schedule. Let me find who's available.");
      }
      const service = await loadServiceType(tx, input.service_type);
      const start = parseDateInput(input.window_start, "window_start");
      await assertSlot(tx, tech.id, tech.name, start, service.durationMinutes, now);

      const end = addMinutes(start, ARRIVAL_WINDOW_MIN);
      const jobEnd = addMinutes(start, service.durationMinutes);
      const invoiceNumber = await nextInvoiceNumber(tx);
      const jobId = newId("job");
      const source = who.actor === "office" ? "office" : "agent";
      const priority = input.priority ?? "normal";

      await tx.insert(jobs).values({
        id: jobId,
        invoiceNumber,
        description: service.name,
        workStatus: "scheduled",
        scheduledStart: start,
        scheduledEnd: jobEnd,
        arrivalWindow: ARRIVAL_WINDOW_MIN,
        customerId: cust.id,
        addressId: addr.id,
        source,
        priority,
        serviceType: service.id,
        tags: [],
      });
      await tx.insert(jobAssignments).values({ jobId, employeeId: tech.id });

      const lines = [`Booked by ${source === "agent" ? "phone agent" : "office"}.`, `Issue: ${input.issue_summary.trim()}`];
      if (input.caller_name || input.caller_phone) {
        lines.push(`Caller: ${[input.caller_name?.trim(), input.caller_phone?.trim()].filter(Boolean).join(", ")}`);
      }
      if (input.access_notes?.trim()) lines.push(`Access: ${input.access_notes.trim()}`);
      if (priority !== "normal") lines.push(`Priority: ${priority}`);
      await appendNote(tx, { jobId, content: lines.join("\n"), authorType: noteAuthor(who), authorId: actorId(who) });

      if (input.caller_phone) {
        await tx
          .insert(customerPhones)
          .values({ id: newId("phn"), customerId: cust.id, phone: input.caller_phone, label: "mobile", source })
          .onConflictDoUpdate({
            target: [customerPhones.customerId, customerPhones.phone],
            set: { lastSeenAt: sql`now()` },
          });
      }

      const label = windowLabel(start, end);
      const addressLabel = addressLabelOf(addr);
      const confirmation_line = `You're set for ${spokenDay(start, now)}, ${label.split(", ").slice(1).join(", ")}, with ${firstName(
        tech.name,
      )}. Your confirmation number is ${invoiceNumber}.`;

      const result: BookJobResult = {
        job_id: jobId,
        invoice_number: invoiceNumber,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        window_label: label,
        employee_id: tech.id,
        employee_name: tech.name,
        confirmation_line,
        speech_hint: confirmation_line,
      };
      return {
        result,
        event: {
          actor: who.actor,
          actorId: actorId(who),
          callId: await resolveCallId(tx, who.callId),
          type: "job.booked",
          entityType: "job",
          entityId: jobId,
          payload: {
            actor_label: await actorLabelFor(tx, who),
            summary: `Booked a ${service.name.toLowerCase()} for ${cust.name} at ${addressLabel}, ${label}, with ${tech.name}.`,
            job_id: jobId,
            invoice_number: invoiceNumber,
            window_start: start.toISOString(),
            window_end: end.toISOString(),
            employee_id: tech.id,
            employee_name: tech.name,
            service_type: service.id,
            priority,
            customer_id: cust.id,
            address_id: addr.id,
            address_label: addressLabel,
          },
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// rescheduleJob
// ---------------------------------------------------------------------------

export type RescheduleJobInput = {
  job_id: string;
  new_window_start: string;
  employee_id?: string;
  reason: string;
  idempotency_key?: string;
  now?: Date;
};

export type RescheduleJobResult = {
  job_id: string;
  old_window_label: string | null;
  new_window_label: string;
  new_window_start: string;
  new_window_end: string;
  employee_id: string;
  employee_name: string;
  speech_hint: string;
  [k: string]: unknown;
};

export async function rescheduleJob(input: RescheduleJobInput, who: WriteActor): Promise<RescheduleJobResult> {
  const now = input.now ?? new Date();
  return runWrite<RescheduleJobResult>({
    tool: "reschedule_job",
    idempotencyKey: input.idempotency_key,
    execute: async (tx) => {
      const job = await requireJob(tx, input.job_id);
      if (!OPEN_FOR_CHANGE.includes(job.workStatus)) {
        throw new ToolError(
          "invalid_state",
          `job ${job.id} is ${job.workStatus}`,
          describeLocked(job.workStatus),
          { work_status: job.workStatus },
        );
      }
      const current = primaryTech(job);
      const targetId = input.employee_id ?? current?.id;
      if (!targetId) {
        throw new ToolError("validation", "job has no tech and none was given", "That visit doesn't have a technician yet. Let me find who's available first.");
      }
      const tech = await loadTech(tx, targetId);
      if (!tech) {
        throw new ToolError("not_found", `employee ${targetId} is not a schedulable tech`, "That technician isn't on the schedule. Let me find who's available.");
      }
      const duration = await jobDurationMinutes(tx, job);
      const start = parseDateInput(input.new_window_start, "new_window_start");
      await assertSlot(tx, tech.id, tech.name, start, duration, now, job.id);

      const oldWindow = windowOf(job);
      const oldLabel = oldWindow ? windowLabel(oldWindow.start, oldWindow.end) : null;
      const end = addMinutes(start, ARRIVAL_WINDOW_MIN);

      await tx
        .update(jobs)
        .set({
          scheduledStart: start,
          scheduledEnd: addMinutes(start, duration),
          arrivalWindow: ARRIVAL_WINDOW_MIN,
          workStatus: "scheduled",
          updatedAt: sql`now()`,
        })
        .where(eq(jobs.id, job.id));

      if (!current) {
        await tx.insert(jobAssignments).values({ jobId: job.id, employeeId: tech.id });
      } else if (current.id !== tech.id) {
        await tx.delete(jobAssignments).where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.employeeId, current.id)));
        await tx.insert(jobAssignments).values({ jobId: job.id, employeeId: tech.id }).onConflictDoNothing();
      }

      const newLabel = windowLabel(start, end);
      await appendNote(tx, {
        jobId: job.id,
        content: `Rescheduled${oldLabel ? ` from ${oldLabel}` : ""} to ${newLabel} with ${tech.name}. Reason: ${input.reason.trim()}`,
        authorType: noteAuthor(who),
        authorId: actorId(who),
      });

      const speech_hint = `Done. I've moved it to ${spokenDay(start, now)}, ${newLabel.split(", ").slice(1).join(", ")}, with ${firstName(tech.name)}.`;
      const result: RescheduleJobResult = {
        job_id: job.id,
        old_window_label: oldLabel,
        new_window_label: newLabel,
        new_window_start: start.toISOString(),
        new_window_end: end.toISOString(),
        employee_id: tech.id,
        employee_name: tech.name,
        speech_hint,
      };
      return {
        result,
        event: {
          actor: who.actor,
          actorId: actorId(who),
          callId: await resolveCallId(tx, who.callId),
          type: "job.rescheduled",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: await actorLabelFor(tx, who),
            summary: `Moved ${job.customerName}'s visit${oldLabel ? ` from ${oldLabel}` : ""} to ${newLabel} with ${tech.name}.`,
            job_id: job.id,
            old_window_start: oldWindow?.start.toISOString() ?? null,
            new_window_start: start.toISOString(),
            old_employee_id: current?.id ?? null,
            new_employee_id: tech.id,
            reason: input.reason.trim(),
          },
        },
      };
    },
  });
}

function describeLocked(status: WorkStatus): string {
  switch (status) {
    case "complete rated":
    case "complete unrated":
      return "That visit is already complete, so I can't move it. I can book a new visit instead.";
    case "user canceled":
    case "pro canceled":
      return "That visit was canceled, so there's nothing to move. I can book a new one for you.";
    case "in progress":
      return "The technician is already on that job, so I can't reschedule it. Would you like me to have the office call you?";
    case "pending_cancellation":
      return "There's a cancellation pending on that visit. I'll have the office sort it out and call you back.";
    default:
      return "I can't change that visit from here. Let me have the office call you.";
  }
}

// ---------------------------------------------------------------------------
// Office-side functions (no agent tool)
// ---------------------------------------------------------------------------

export type OfficeResult = { job_id: string; work_status: WorkStatus; [k: string]: unknown };

/** Office cancels a job outright; any pending cancellation request is closed as approved. */
export async function cancelJob(
  jobId: string,
  byUserId: string,
  reason: string,
  opts: { status?: "user canceled" | "pro canceled"; idempotency_key?: string } = {},
): Promise<OfficeResult> {
  const who: WriteActor = { actor: "office", actorId: byUserId };
  const target = opts.status ?? "user canceled";
  return runWrite<OfficeResult>({
    tool: "cancel_job",
    idempotencyKey: opts.idempotency_key,
    execute: async (tx) => {
      const job = await requireJob(tx, jobId);
      if (TERMINAL.includes(job.workStatus)) {
        throw new ToolError("invalid_state", `job ${job.id} is ${job.workStatus}`, `That job is already ${job.workStatus}.`, {
          work_status: job.workStatus,
        });
      }
      await tx
        .update(jobs)
        .set({ workStatus: target, canceledAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(jobs.id, job.id));
      await tx
        .update(changeRequests)
        .set({ status: "approved", resolvedAt: sql`now()`, resolvedBy: byUserId, resolutionNote: reason })
        .where(and(eq(changeRequests.jobId, job.id), eq(changeRequests.status, "pending")));
      await tx
        .update(tasks)
        .set({ status: "done", resolvedAt: sql`now()` })
        .where(and(eq(tasks.jobId, job.id), eq(tasks.kind, "cancellation"), eq(tasks.status, "open")));
      await appendNote(tx, { jobId: job.id, content: `Canceled by office. Reason: ${reason.trim()}`, authorType: "office", authorId: byUserId });
      const label = await actorLabelFor(tx, who);
      return {
        result: { job_id: job.id, work_status: target, previous_status: job.workStatus },
        event: {
          actor: "office",
          actorId: byUserId,
          type: "job.status_changed",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: label,
            summary: `${label} canceled ${job.customerName}'s visit${windowLabelOf(job) ? ` (${windowLabelOf(job)})` : ""}: ${reason.trim()}`,
            job_id: job.id,
            from: job.workStatus,
            to: target,
            reason: reason.trim(),
          },
        },
      };
    },
  });
}

/** Replace the job's field tech (or add one) and emit `job.reassigned`. */
export async function assignJob(jobId: string, employeeId: string, byUserId: string): Promise<OfficeResult & { employee_id: string }> {
  const who: WriteActor = { actor: "office", actorId: byUserId };
  return runWrite<OfficeResult & { employee_id: string }>({
    tool: "assign_job",
    execute: async (tx) => {
      const job = await requireJob(tx, jobId);
      if (TERMINAL.includes(job.workStatus)) {
        throw new ToolError("invalid_state", `job ${job.id} is ${job.workStatus}`, `That job is ${job.workStatus}; it can't be reassigned.`);
      }
      const tech = await loadTech(tx, employeeId);
      if (!tech) {
        throw new ToolError("not_found", `employee ${employeeId} is not a schedulable tech`, "That employee is not a field tech.");
      }
      const current = primaryTech(job);
      if (current?.id === tech.id) {
        throw new ToolError("invalid_state", "already assigned", `${tech.name} is already on that job.`);
      }
      if (current) {
        await tx.delete(jobAssignments).where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.employeeId, current.id)));
      }
      await tx.insert(jobAssignments).values({ jobId: job.id, employeeId: tech.id }).onConflictDoNothing();
      await tx.update(jobs).set({ updatedAt: sql`now()` }).where(eq(jobs.id, job.id));
      const label = await actorLabelFor(tx, who);
      return {
        result: { job_id: job.id, work_status: job.workStatus, employee_id: tech.id, employee_name: tech.name },
        event: {
          actor: "office",
          actorId: byUserId,
          type: "job.reassigned",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: label,
            summary: `${label} assigned ${job.customerName}'s visit to ${tech.name}${current ? ` (was ${current.name})` : ""}.`,
            job_id: job.id,
            from_employee_id: current?.id ?? null,
            to_employee_id: tech.id,
          },
        },
      };
    },
  });
}

/** Office status change with the matching timestamps; emits `job.status_changed`. */
export async function setJobStatus(jobId: string, status: WorkStatus, byUserId: string, note?: string): Promise<OfficeResult> {
  const who: WriteActor = { actor: "office", actorId: byUserId };
  return runWrite<OfficeResult>({
    tool: "set_job_status",
    execute: async (tx) => {
      const job = await requireJob(tx, jobId);
      if (job.workStatus === status) {
        throw new ToolError("invalid_state", `job ${job.id} is already ${status}`, `That job is already ${status}.`);
      }
      const patch: Partial<typeof jobs.$inferInsert> = { workStatus: status };
      const nowSql = sql`now()`;
      if (status === "in progress") patch.startedAt = nowSql as unknown as Date;
      if (status === "complete rated" || status === "complete unrated") patch.completedAt = nowSql as unknown as Date;
      if (status === "user canceled" || status === "pro canceled") patch.canceledAt = nowSql as unknown as Date;
      await tx
        .update(jobs)
        .set({ ...patch, updatedAt: nowSql })
        .where(eq(jobs.id, job.id));
      if (note?.trim()) {
        await appendNote(tx, { jobId: job.id, content: note.trim(), authorType: "office", authorId: byUserId });
      }
      const label = await actorLabelFor(tx, who);
      return {
        result: { job_id: job.id, work_status: status, previous_status: job.workStatus },
        event: {
          actor: "office",
          actorId: byUserId,
          type: "job.status_changed",
          entityType: "job",
          entityId: job.id,
          payload: {
            actor_label: label,
            summary: `${label} set ${job.customerName}'s visit to ${status}.`,
            job_id: job.id,
            from: job.workStatus,
            to: status,
          },
        },
      };
    },
  });
}

/** Exposed for tests / the UI: is this status one the agent may still change? */
export function isOpenForChange(status: WorkStatus): boolean {
  return OPEN_FOR_CHANGE.includes(status);
}
