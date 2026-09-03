/**
 * W1-B domain tests. Run against TEST_DATABASE_URL (see scheduling.test-utils).
 * Fixture days are 2026-09-21 onward, where the imported data has no
 * blocking jobs, so every scenario is fully controlled.
 */
import { db, et, makeFixture, seedJob, type Fixture } from "./scheduling.test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { addMinutes } from "date-fns";
import { changeRequests, events, idempotencyKeys, jobAssignments, jobs, notes, tasks } from "@/db/schema";
import { isoDateET } from "@/lib/time";
import { ToolError } from "@/agent/errors";
import { findAvailability, isTechFree, spokenSlot, windowLabel, windowsForDay, type Slot } from "./availability";
import { assignJob, bookJob, cancelJob, rescheduleJob, setJobStatus } from "./jobs";
import { approveCancellation, rejectCancellation, requestCancellation } from "./change-requests";
import { addNote, redactPreview } from "./notes";
import { createTask } from "./tasks";

const AGENT = { actor: "agent" as const, actorId: "vapi", callId: null };
const EARLY = new Date("2026-09-20T00:00:00Z"); // "now" before every fixture window
let fx: Fixture;

beforeAll(async () => {
  fx = await makeFixture("dom");
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
});

async function expectToolError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    expect((e as ToolError).code).toBe(code);
    expect((e as ToolError).speechHint.length).toBeGreaterThan(10);
    return e as ToolError;
  }
  throw new Error(`expected ToolError ${code}`);
}

async function assertNoCollisions(slots: Slot[], durationMin: number) {
  for (const s of slots) {
    const start = new Date(s.window_start);
    const rows = await db
      .select({ id: jobs.id, start: jobs.scheduledStart, end: jobs.scheduledEnd, status: jobs.workStatus })
      .from(jobs)
      .innerJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(
        and(
          eq(jobAssignments.employeeId, s.employee_id),
          inArray(jobs.workStatus, ["scheduled", "in progress", "pending_cancellation", "needs scheduling"]),
          // Jobs on the slot's ET day (the import has a few "scheduled" rows
          // whose end is weeks after their start; those only block their own day).
          sql`(${jobs.scheduledStart} at time zone 'America/New_York')::date = ${isoDateET(start)}::date`,
          sql`${jobs.scheduledStart} < ${addMinutes(start, durationMin).toISOString()}::timestamptz`,
          sql`coalesce(${jobs.scheduledEnd}, ${jobs.scheduledStart} + interval '120 minutes') > ${start.toISOString()}::timestamptz`,
        ),
      );
    expect(rows, `${s.employee_name} ${s.window_label} collides with ${JSON.stringify(rows)}`).toHaveLength(0);
  }
}

describe("windows and labels", () => {
  it("builds hourly windows that end within hours (Mon 8-6, Sat 8-2)", () => {
    const mon = { dow: 1, open: "08:00", close: "18:00", closed: false, tz: "America/New_York" };
    const sat = { dow: 6, open: "08:00", close: "14:00", closed: false, tz: "America/New_York" };
    const diag = windowsForDay("2026-09-21", mon, 60).map((w) => isoDateET(w.start) + " " + w.start.toISOString());
    expect(diag).toHaveLength(9); // 8..16 (window ends by 18:00)
    expect(windowsForDay("2026-09-21", mon, 480)).toHaveLength(3); // install: 8, 9, 10
    expect(windowsForDay("2026-09-26", sat, 60)).toHaveLength(5); // 8..12
    expect(windowsForDay("2026-09-26", sat, 480)).toHaveLength(0);
    expect(windowsForDay("2026-09-27", { dow: 0, open: null, close: null, closed: true, tz: "America/New_York" }, 60)).toHaveLength(0);
  });

  it("is DST-safe: 8 AM is 12:00Z in September and 13:00Z in November", () => {
    const mon = { dow: 1, open: "08:00", close: "18:00", closed: false, tz: "America/New_York" };
    expect(windowsForDay("2026-09-21", mon, 60)[0].start.toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(windowsForDay("2026-11-02", mon, 60)[0].start.toISOString()).toBe("2026-11-02T13:00:00.000Z");
    expect(windowLabel(et("2026-11-02", "08:00"), et("2026-11-02", "10:00"))).toBe("Monday November 2, 8 AM to 10 AM");
    expect(windowLabel(et("2026-09-22", "10:00"), et("2026-09-22", "12:00"))).toBe("Tuesday September 22, 10 AM to noon");
  });

  it("speaks slots the way a front desk would", () => {
    const slot: Slot = {
      window_start: et("2026-09-22", "10:00").toISOString(),
      window_end: et("2026-09-22", "12:00").toISOString(),
      window_label: "",
      employee_id: "x",
      employee_name: "Tanya Sawyer",
      reason: "least_loaded",
    };
    const now = et("2026-09-21", "09:00");
    expect(spokenSlot(slot, now, true)).toBe("tomorrow between 10 and noon with Tanya");
    expect(spokenSlot({ ...slot, employee_name: "Felix Fitzgerald" }, et("2026-09-18", "09:00"), false)).toBe("Tuesday 10 to noon with Felix");
    expect(spokenSlot(slot, et("2026-09-01", "09:00"), false)).toBe("Tuesday September 22 10 to noon with Tanya");
  });

  it("redacts phones and codes in note previews", () => {
    expect(redactPreview("Gate code 4521, call 305-555-0142 first")).toBe("Gate code [code], call [phone] first");
    expect(redactPreview("door code is #1234 and the pin 9987")).toMatch(/\[code\]/);
    expect(redactPreview("x".repeat(200)).length).toBeLessThanOrEqual(120);
  });
});

describe("findAvailability", () => {
  it("respects Saturday hours and skips Sunday", async () => {
    const r = await findAvailability({ from: "2026-09-26", to: "2026-09-27", service_type: "diagnostic", limit: 8, now: EARLY });
    expect(r.slots.length).toBeGreaterThan(0);
    for (const s of r.slots) {
      expect(isoDateET(s.window_start)).toBe("2026-09-26");
      expect(new Date(s.window_end) <= et("2026-09-26", "14:00")).toBe(true);
    }
    expect(r.closed_days).toEqual(["2026-09-27"]);
    const sun = await findAvailability({ from: "2026-09-27", service_type: "diagnostic", to: "2026-09-27", now: EARLY });
    expect(sun.slots).toEqual([]);
    const satInstall = await findAvailability({ from: "2026-09-26", to: "2026-09-27", service_type: "install", now: EARLY });
    expect(satInstall.slots).toEqual([]);
  });

  it("is DST-safe in November and never offers a window in the past", async () => {
    const nov = await findAvailability({ from: "2026-11-02", to: "2026-11-02", service_type: "diagnostic", now: new Date("2026-11-02T12:30:00Z") });
    expect(nov.slots[0].window_start).toBe("2026-11-02T13:00:00.000Z");
    expect(nov.slots[0].window_label).toBe("Monday November 2, 8 AM to 10 AM");

    const now = et("2026-09-21", "11:30");
    const r = await findAvailability({ from: "2026-09-21", to: "2026-09-21", service_type: "diagnostic", limit: 6, now });
    expect(r.slots.length).toBeGreaterThan(0);
    for (const s of r.slots) expect(new Date(s.window_start) > now).toBe(true);
    expect(r.slots[0].window_start).toBe(et("2026-09-21", "12:00").toISOString());
  });

  it("spreads slots across days, at most two per day", async () => {
    const r = await findAvailability({ from: "2026-09-21", service_type: "diagnostic", limit: 4, now: EARLY });
    expect(r.slots).toHaveLength(4);
    const days = r.slots.map((s) => isoDateET(s.window_start));
    expect(new Set(days).size).toBe(4); // Mon..Thu, one each
    const six = await findAvailability({ from: "2026-09-21", to: "2026-09-23", service_type: "diagnostic", limit: 6, now: EARLY });
    const perDay = new Map<string, number>();
    for (const s of six.slots) perDay.set(isoDateET(s.window_start), (perDay.get(isoDateET(s.window_start)) ?? 0) + 1);
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
    expect(six.slots).toHaveLength(6);
    // Single day requested → more than two allowed.
    const one = await findAvailability({ from: "2026-09-24", to: "2026-09-24", service_type: "diagnostic", limit: 4, now: EARLY });
    expect(one.slots).toHaveLength(4);
    for (const s of one.slots) expect(isoDateET(s.window_start)).toBe("2026-09-24");
  });

  it("never double-books across techs and honours service duration", async () => {
    // Every tech busy 10-11 on Wed 9/23.
    for (const t of fx.techs) await seedJob(fx, { employeeIds: [t.id], start: et("2026-09-23", "10:00"), durationMin: 60 });
    const diag = await findAvailability({ from: "2026-09-23", to: "2026-09-23", service_type: "diagnostic", limit: 8, now: EARLY });
    expect(diag.slots.map((s) => s.window_start)).not.toContain(et("2026-09-23", "10:00").toISOString());
    await assertNoCollisions(diag.slots, 60);
    // A 2-hour repair starting at 9 would overlap 10-11, so 9 AM is out too.
    const repair = await findAvailability({ from: "2026-09-23", to: "2026-09-23", service_type: "repair", limit: 8, now: EARLY });
    const starts = repair.slots.map((s) => s.window_start);
    expect(starts).not.toContain(et("2026-09-23", "09:00").toISOString());
    expect(starts).not.toContain(et("2026-09-23", "10:00").toISOString());
    await assertNoCollisions(repair.slots, 120);
  });

  it("prefers the tech who last completed a job at the address", async () => {
    const gerald = fx.byName("Gerald");
    await seedJob(fx, { employeeIds: [gerald.id], start: et("2026-08-03", "10:00"), status: "complete rated", completedAt: et("2026-08-03", "11:00") });
    const r = await findAvailability({ from: "2026-09-28", to: "2026-09-28", service_type: "diagnostic", address_id: fx.addressId, now: EARLY });
    expect(r.slots[0].employee_id).toBe(gerald.id);
    expect(r.slots[0].reason).toBe("last_tech_here");
    const without = await findAvailability({ from: "2026-09-28", to: "2026-09-28", service_type: "diagnostic", now: EARLY });
    expect(without.slots[0].employee_id).not.toBe(gerald.id);
  });

  it("falls back to the least-loaded tech that day", async () => {
    const tanya = fx.byName("Tanya"); // most lifetime jobs → default pick
    const base = await findAvailability({ from: "2026-09-29", to: "2026-09-29", service_type: "diagnostic", now: EARLY });
    expect(base.slots[0].employee_id).toBe(tanya.id);
    await seedJob(fx, { employeeIds: [tanya.id], start: et("2026-09-29", "15:00"), durationMin: 60 });
    const r = await findAvailability({ from: "2026-09-29", to: "2026-09-29", service_type: "diagnostic", now: EARLY });
    expect(r.slots[0].employee_id).not.toBe(tanya.id);
    expect(r.slots[0].reason).toBe("least_loaded");
    // A preferred tech wins over load.
    const pref = await findAvailability({ from: "2026-09-29", to: "2026-09-29", service_type: "diagnostic", preferred_employee_id: tanya.id, now: EARLY });
    expect(pref.slots[0].employee_id).toBe(tanya.id);
  });

  it("only offers field techs", async () => {
    const r = await findAvailability({ from: "2026-09-21", service_type: "repair", limit: 8, now: EARLY });
    const techIds = new Set(fx.techs.map((t) => t.id));
    for (const s of r.slots) expect(techIds.has(s.employee_id)).toBe(true);
  });

  it("prefers the current tech and respects the job's service duration", async () => {
    const tanya = fx.byName("Tanya");
    const booked = await bookJob(
      { customer_id: fx.customerId, address_id: fx.addressId, service_type: "repair", window_start: et("2026-10-26", "10:00").toISOString(), employee_id: tanya.id, issue_summary: "Reschedule source", now: EARLY },
      AGENT,
    );
    fx.jobIds.add(booked.job_id);
    const r = await findAvailability({
      from: "2026-10-27",
      to: "2026-10-27",
      service_type: "repair",
      preferred_employee_id: tanya.id,
      now: EARLY,
    });
    expect(r.slots[0].employee_id).toBe(tanya.id);
    await assertNoCollisions(r.slots, 120);
  });

  it("seed sanity: today onward has 3+ diagnostic slots, none colliding with the imported schedule", async () => {
    const midnight = et("2026-09-02", "00:00");
    const r = await findAvailability({ from: "2026-09-02", service_type: "diagnostic", now: midnight });
    expect(r.slots.length).toBeGreaterThanOrEqual(3);
    await assertNoCollisions(r.slots, 60);
    const wide = await findAvailability({ from: "2026-09-02", to: "2026-09-15", service_type: "repair", limit: 12, now: midnight });
    expect(wide.slots.length).toBeGreaterThanOrEqual(3);
    await assertNoCollisions(wide.slots, 120);
    // Live clock: nothing offered in the past.
    const live = await findAvailability({ from: "2026-09-02", service_type: "diagnostic" });
    expect(live.slots.length).toBeGreaterThanOrEqual(3);
    for (const s of live.slots) expect(new Date(s.window_start) > new Date()).toBe(true);
  });
});

describe("bookJob", () => {
  it("books, numbers the invoice, assigns, notes, saves the phone and emits job.booked", async () => {
    const tanya = fx.byName("Tanya");
    const start = et("2026-09-30", "10:00");
    const [{ max }] = await db.select({ max: sql<string>`max(${jobs.invoiceNumber}::int)::text` }).from(jobs).where(sql`${jobs.invoiceNumber} ~ '^[0-9]+$'`);
    const r = await bookJob(
      {
        customer_id: fx.customerId,
        address_id: fx.addressId,
        service_type: "diagnostic",
        window_start: start.toISOString(),
        employee_id: tanya.id,
        issue_summary: "No cooling upstairs since last night",
        caller_name: "Pat Tester",
        caller_phone: "+13055550199",
        access_notes: "Gate code 4521",
        priority: "high",
        now: EARLY,
      },
      AGENT,
    );
    fx.jobIds.add(r.job_id);
    expect(Number(r.invoice_number)).toBeGreaterThan(Number(max));
    expect(r.window_label).toBe("Wednesday September 30, 10 AM to noon");
    expect(r.employee_name).toBe(tanya.name);
    expect(r.confirmation_line).toContain("Tanya");
    expect(r.confirmation_line).toContain(r.invoice_number);
    expect(r.speech_hint).not.toContain("4521");

    const [job] = await db.select().from(jobs).where(eq(jobs.id, r.job_id));
    expect(job.workStatus).toBe("scheduled");
    expect(job.source).toBe("agent");
    expect(job.serviceType).toBe("diagnostic");
    expect(job.priority).toBe("high");
    expect(job.scheduledEnd?.toISOString()).toBe(addMinutes(start, 60).toISOString());
    expect(job.arrivalWindow).toBe(120);
    const asg = await db.select().from(jobAssignments).where(eq(jobAssignments.jobId, r.job_id));
    expect(asg.map((a) => a.employeeId)).toEqual([tanya.id]);
    const nts = await db.select().from(notes).where(eq(notes.jobId, r.job_id));
    expect(nts).toHaveLength(1);
    expect(nts[0].authorType).toBe("agent");
    expect(nts[0].content).toContain("Gate code 4521");
    expect(nts[0].content).toContain("Pat Tester");
    const evs = await db.select().from(events).where(and(eq(events.entityId, r.job_id), eq(events.type, "job.booked")));
    expect(evs).toHaveLength(1);
    expect(evs[0].payload.summary).toBeTruthy();
    expect(evs[0].payload.actor_label).toBe("Agent");
    expect(evs[0].payload.employee_id).toBe(tanya.id);
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(sql`customer_phones`).where(sql`customer_id = ${fx.customerId} and phone = '+13055550199'`);
    expect(Number(n)).toBe(1);
    expect(await isTechFree(db, tanya.id, start, 60)).toBe(false);
  });

  it("rejects a taken slot for the same tech but allows another tech", async () => {
    const tanya = fx.byName("Tanya");
    const felix = fx.byName("Felix");
    const start = et("2026-09-30", "10:00").toISOString();
    const base = { customer_id: fx.customerId, address_id: fx.addressId, service_type: "repair", window_start: start, issue_summary: "Second booking", now: EARLY };
    const err = await expectToolError(bookJob({ ...base, employee_id: tanya.id }, AGENT), "slot_taken");
    expect(err.speechHint).toContain("Tanya");
    const ok = await bookJob({ ...base, employee_id: felix.id }, AGENT);
    fx.jobIds.add(ok.job_id);
    expect(ok.employee_name).toBe(felix.name);
    // A repair blocks two hours: 11 AM is now taken for Felix too.
    await expectToolError(bookJob({ ...base, employee_id: felix.id, window_start: et("2026-09-30", "11:00").toISOString() }, AGENT), "slot_taken");
  });

  it("rejects windows outside hours, in the past, and unknown techs/customers", async () => {
    const tanya = fx.byName("Tanya");
    const base = { customer_id: fx.customerId, address_id: fx.addressId, service_type: "diagnostic", employee_id: tanya.id, issue_summary: "x y z", now: EARLY };
    await expectToolError(bookJob({ ...base, window_start: et("2026-10-04", "10:00").toISOString() }, AGENT), "outside_hours"); // Sunday
    await expectToolError(bookJob({ ...base, window_start: et("2026-10-05", "17:30").toISOString() }, AGENT), "outside_hours");
    await expectToolError(bookJob({ ...base, window_start: et("2026-09-01", "10:00").toISOString() }, AGENT), "outside_hours"); // past
    await expectToolError(bookJob({ ...base, window_start: et("2026-10-05", "10:00").toISOString(), employee_id: "pro_nope" }, AGENT), "not_found");
    const admin = await db.select({ id: sql<string>`id` }).from(sql`employees`).where(sql`role = 'admin'`).limit(1);
    await expectToolError(bookJob({ ...base, window_start: et("2026-10-05", "10:00").toISOString(), employee_id: admin[0].id }, AGENT), "not_found");
    await expectToolError(bookJob({ ...base, window_start: et("2026-10-05", "10:00").toISOString(), customer_id: "cus_nope" }, AGENT), "not_found");
  });

  it("replays idempotently: same job_id, one row, one event", async () => {
    const felix = fx.byName("Felix");
    const key = `${fx.keyPrefix}book-1`;
    const input = {
      customer_id: fx.customerId,
      address_id: fx.addressId,
      service_type: "maintenance",
      window_start: et("2026-10-01", "08:00").toISOString(),
      employee_id: felix.id,
      issue_summary: "Annual tune-up",
      idempotency_key: key,
      now: EARLY,
    };
    const [a, b] = await Promise.all([bookJob(input, AGENT), bookJob(input, AGENT)]);
    const c = await bookJob(input, AGENT);
    fx.jobIds.add(a.job_id);
    expect(b.job_id).toBe(a.job_id);
    expect(c).toEqual(a);
    const rows = await db.select().from(jobs).where(and(eq(jobs.customerId, fx.customerId), eq(jobs.scheduledStart, new Date(input.window_start))));
    expect(rows).toHaveLength(1);
    const evs = await db.select().from(events).where(and(eq(events.entityId, a.job_id), eq(events.type, "job.booked")));
    expect(evs).toHaveLength(1);
    const [k] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
    expect(k.tool).toBe("book_job");
  });

  it("assigns unique invoice numbers under concurrent bookings", async () => {
    const tanya = fx.byName("Tanya");
    const base = {
      customer_id: fx.customerId,
      address_id: fx.addressId,
      service_type: "diagnostic",
      employee_id: tanya.id,
      issue_summary: "Concurrent booking",
      now: EARLY,
    };
    const starts = Array.from({ length: 10 }, (_, i) => {
      const day = i < 5 ? "2026-11-09" : "2026-11-10";
      const hour = String(8 + (i % 5)).padStart(2, "0");
      return et(day, `${hour}:00`).toISOString();
    });
    const results = await Promise.all(starts.map((window_start) => bookJob({ ...base, window_start }, AGENT)));
    results.forEach((r) => fx.jobIds.add(r.job_id));
    const invoices = results.map((r) => r.invoice_number);
    expect(new Set(invoices).size).toBe(invoices.length);
    for (const n of invoices) expect(n).toMatch(/^\d+$/);

    // Remove these jobs immediately so later tests that look up the "latest"
    // job at this address see only jobs created by those tests.
    const ids = results.map((r) => r.job_id);
    await db.delete(events).where(inArray(events.entityId, ids));
    await db.delete(jobs).where(inArray(jobs.id, ids));
  });
});

describe("rescheduleJob", () => {
  it("moves a scheduled job, keeps the tech by default, notes it and emits job.rescheduled", async () => {
    const tanya = fx.byName("Tanya");
    const booked = await bookJob(
      { customer_id: fx.customerId, address_id: fx.addressId, service_type: "diagnostic", window_start: et("2026-10-05", "10:00").toISOString(), employee_id: tanya.id, issue_summary: "Move me", now: EARLY },
      AGENT,
    );
    fx.jobIds.add(booked.job_id);
    const r = await rescheduleJob({ job_id: booked.job_id, new_window_start: et("2026-10-06", "13:00").toISOString(), reason: "Caller is travelling Monday", now: EARLY }, AGENT);
    expect(r.old_window_label).toBe("Monday October 5, 10 AM to noon");
    expect(r.new_window_label).toBe("Tuesday October 6, 1 PM to 3 PM");
    expect(r.employee_id).toBe(tanya.id);
    expect(r.speech_hint).toContain("Tanya");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(job.scheduledStart?.toISOString()).toBe(et("2026-10-06", "13:00").toISOString());
    expect(job.scheduledEnd?.toISOString()).toBe(et("2026-10-06", "14:00").toISOString());
    expect(await isTechFree(db, tanya.id, et("2026-10-05", "10:00"), 60)).toBe(true);
    const evs = await db.select().from(events).where(and(eq(events.entityId, booked.job_id), eq(events.type, "job.rescheduled")));
    expect(evs).toHaveLength(1);
    expect(evs[0].payload.reason).toBe("Caller is travelling Monday");
    const nts = await db.select().from(notes).where(eq(notes.jobId, booked.job_id));
    expect(nts.some((n) => n.content.startsWith("Rescheduled from"))).toBe(true);

    // Change tech and collide with an existing booking → slot_taken.
    const felix = fx.byName("Felix");
    await seedJob(fx, { employeeIds: [felix.id], start: et("2026-10-07", "09:00"), durationMin: 60 });
    await expectToolError(
      rescheduleJob({ job_id: booked.job_id, new_window_start: et("2026-10-07", "09:00").toISOString(), employee_id: felix.id, reason: "wants Felix", now: EARLY }, AGENT),
      "slot_taken",
    );
    const moved = await rescheduleJob({ job_id: booked.job_id, new_window_start: et("2026-10-07", "10:00").toISOString(), employee_id: felix.id, reason: "wants Felix", now: EARLY }, AGENT);
    expect(moved.employee_id).toBe(felix.id);
    const asg = await db.select().from(jobAssignments).where(eq(jobAssignments.jobId, booked.job_id));
    expect(asg.map((a) => a.employeeId)).toEqual([felix.id]);
  });

  it("refuses completed and canceled jobs with invalid_state", async () => {
    const gerald = fx.byName("Gerald");
    const done = await seedJob(fx, { employeeIds: [gerald.id], start: et("2026-08-10", "10:00"), status: "complete unrated" });
    const err = await expectToolError(rescheduleJob({ job_id: done, new_window_start: et("2026-10-08", "10:00").toISOString(), reason: "x", now: EARLY }, AGENT), "invalid_state");
    expect(err.speechHint).toMatch(/complete/i);
    const canceled = await seedJob(fx, { employeeIds: [gerald.id], start: et("2026-10-08", "10:00"), status: "user canceled" });
    await expectToolError(rescheduleJob({ job_id: canceled, new_window_start: et("2026-10-08", "11:00").toISOString(), reason: "x", now: EARLY }, AGENT), "invalid_state");
    await expectToolError(rescheduleJob({ job_id: "job_nope", new_window_start: et("2026-10-08", "11:00").toISOString(), reason: "x", now: EARLY }, AGENT), "not_found");
  });
});

describe("cancellation requests", () => {
  async function bookOne(day: string, hh: string) {
    const r = await bookJob(
      { customer_id: fx.customerId, address_id: fx.addressId, service_type: "diagnostic", window_start: et(day, hh).toISOString(), employee_id: fx.byName("Yvonne").id, issue_summary: "cancel flow", now: EARLY },
      AGENT,
    );
    fx.jobIds.add(r.job_id);
    return r;
  }

  it("flips the job to pending_cancellation, records previous_status, opens the admin task and emits", async () => {
    const booked = await bookOne("2026-10-12", "10:00");
    const r = await requestCancellation({ job_id: booked.job_id, reason: "Selling the house", idempotency_key: `${fx.keyPrefix}cancel-1` }, { ...AGENT, callId: "call_does_not_exist" });
    expect(r.status).toBe("pending");
    expect(r.speech_hint).toMatch(/office/i);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(job.workStatus).toBe("pending_cancellation");
    const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, r.change_request_id));
    expect(cr.status).toBe("pending");
    expect(cr.previousStatus).toBe("scheduled");
    expect(cr.callId).toBeNull(); // unknown call id is not stored
    const tks = await db.select().from(tasks).where(and(eq(tasks.jobId, booked.job_id), eq(tasks.kind, "cancellation")));
    expect(tks).toHaveLength(1);
    expect(tks[0].status).toBe("open");
    expect(tks[0].customerId).toBe(fx.customerId);
    const evs = await db.select().from(events).where(and(eq(events.entityId, booked.job_id), eq(events.type, "job.cancellation_requested")));
    expect(evs).toHaveLength(1);
    expect(evs[0].payload.change_request_id).toBe(r.change_request_id);
    // Replay and double request.
    const again = await requestCancellation({ job_id: booked.job_id, reason: "Selling the house", idempotency_key: `${fx.keyPrefix}cancel-1` }, AGENT);
    expect(again.change_request_id).toBe(r.change_request_id);
    await expectToolError(requestCancellation({ job_id: booked.job_id, reason: "again" }, AGENT), "invalid_state");
    // The pending job still blocks the tech's calendar.
    expect(await isTechFree(db, fx.byName("Yvonne").id, et("2026-10-12", "10:00"), 60)).toBe(false);

    // Reject → status restored, task closed, callback task created.
    const rej = await rejectCancellation(r.change_request_id, "usr_test_owner", "Inside 24 h; fee applies, customer to confirm");
    expect(rej.work_status).toBe("scheduled");
    const [job2] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(job2.workStatus).toBe("scheduled");
    const [cr2] = await db.select().from(changeRequests).where(eq(changeRequests.id, r.change_request_id));
    expect(cr2.status).toBe("rejected");
    expect(cr2.resolvedBy).toBe("usr_test_owner");
    const allTasks = await db.select().from(tasks).where(eq(tasks.jobId, booked.job_id));
    expect(allTasks.find((t) => t.kind === "cancellation")?.status).toBe("done");
    const cb = allTasks.find((t) => t.kind === "callback");
    expect(cb?.status).toBe("open");
    expect(cb?.id).toBe(rej.callback_task_id);
    const rejEv = await db.select().from(events).where(and(eq(events.entityId, booked.job_id), eq(events.type, "job.cancellation_rejected")));
    expect(rejEv).toHaveLength(1);
    expect(rejEv[0].actor).toBe("office");
    await expectToolError(rejectCancellation(r.change_request_id, "usr_test_owner", "again"), "invalid_state");
  });

  it("approve cancels the job and closes the task", async () => {
    const booked = await bookOne("2026-10-13", "10:00");
    const r = await requestCancellation({ job_id: booked.job_id, reason: "Fixed itself" }, AGENT);
    const ap = await approveCancellation(r.change_request_id, "usr_test_owner");
    expect(ap.work_status).toBe("user canceled");
    const [job] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(job.workStatus).toBe("user canceled");
    expect(job.canceledAt).not.toBeNull();
    const tks = await db.select().from(tasks).where(and(eq(tasks.jobId, booked.job_id), eq(tasks.kind, "cancellation")));
    expect(tks[0].status).toBe("done");
    expect(await isTechFree(db, fx.byName("Yvonne").id, et("2026-10-13", "10:00"), 60)).toBe(true);
    await expectToolError(requestCancellation({ job_id: booked.job_id, reason: "x" }, AGENT), "invalid_state");
  });

  it("office cancelJob / assignJob / setJobStatus", async () => {
    const booked = await bookOne("2026-10-14", "10:00");
    const felix = fx.byName("Felix");
    const asg = await assignJob(booked.job_id, felix.id, "usr_test_owner");
    expect(asg.employee_id).toBe(felix.id);
    const rows = await db.select().from(jobAssignments).where(eq(jobAssignments.jobId, booked.job_id));
    expect(rows.map((r) => r.employeeId)).toEqual([felix.id]);
    await expectToolError(assignJob(booked.job_id, felix.id, "usr_test_owner"), "invalid_state");

    const st = await setJobStatus(booked.job_id, "in progress", "usr_test_owner", "Tech on the way");
    expect(st.work_status).toBe("in progress");
    const [j1] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(j1.startedAt).not.toBeNull();

    const cx = await cancelJob(booked.job_id, "usr_test_owner", "Customer no-show", { status: "pro canceled" });
    expect(cx.work_status).toBe("pro canceled");
    await expectToolError(cancelJob(booked.job_id, "usr_test_owner", "again"), "invalid_state");
    const evs = await db.select().from(events).where(eq(events.entityId, booked.job_id));
    const types = evs.map((e) => e.type).sort();
    expect(types).toEqual(["job.booked", "job.reassigned", "job.status_changed", "job.status_changed"]);
  });
});

describe("notes and tasks", () => {
  it("adds a job note and an address note (attached to the latest job, tagged)", async () => {
    const booked = await bookJob(
      // Later than the concurrent-booking fixture so an address-only note still attaches here.
      { customer_id: fx.customerId, address_id: fx.addressId, service_type: "estimate", window_start: et("2026-12-01", "09:00").toISOString(), employee_id: fx.byName("Sidney").id, issue_summary: "note flow", now: EARLY },
      AGENT,
    );
    fx.jobIds.add(booked.job_id);
    const a = await addNote({ job_id: booked.job_id, content: "Dog in the yard, ring twice. Gate code 7788.", idempotency_key: `${fx.keyPrefix}note-1` }, AGENT);
    const b = await addNote({ address_id: fx.addressId, content: "Unit is at the back of the building" }, AGENT);
    expect(b.job_id).toBe(booked.job_id);
    const nts = await db.select().from(notes).where(eq(notes.jobId, booked.job_id)).orderBy(notes.seq);
    expect(nts.map((n) => n.seq)).toEqual([1, 2, 3]);
    expect(nts[2].content.startsWith("[address note] ")).toBe(true);
    const ev = await db.select().from(events).where(and(eq(events.entityId, a.note_id), eq(events.type, "note.added")));
    expect(ev).toHaveLength(1);
    expect(String(ev[0].payload.preview)).not.toContain("7788");
    expect(String(ev[0].payload.preview)).toContain("[code]");
    const replay = await addNote({ job_id: booked.job_id, content: "Dog in the yard, ring twice. Gate code 7788.", idempotency_key: `${fx.keyPrefix}note-1` }, AGENT);
    expect(replay.note_id).toBe(a.note_id);
    await expectToolError(addNote({ content: "no target" }, AGENT), "validation");
    await expectToolError(addNote({ job_id: "job_nope", content: "no job" }, AGENT), "not_found");
  });

  it("creates a task with a speakable hint and emits task.created", async () => {
    const r = await createTask(
      { kind: "callback", title: "Call Pat back about pricing", body: "Promised by 4 PM", customer_id: fx.customerId, due_at: "2026-10-16", idempotency_key: `${fx.keyPrefix}task-1` },
      AGENT,
    );
    fx.taskIds.add(r.task_id);
    expect(r.speech_hint).toMatch(/call you back/i);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, r.task_id));
    expect(t.kind).toBe("callback");
    expect(t.status).toBe("open");
    expect(t.customerId).toBe(fx.customerId);
    expect(t.dueAt?.toISOString()).toBe(et("2026-10-16", "00:00").toISOString());
    const ev = await db.select().from(events).where(and(eq(events.entityId, r.task_id), eq(events.type, "task.created")));
    expect(ev).toHaveLength(1);
    const again = await createTask({ kind: "callback", title: "Call Pat back about pricing", idempotency_key: `${fx.keyPrefix}task-1` }, AGENT);
    expect(again.task_id).toBe(r.task_id);
    await expectToolError(createTask({ kind: "handoff", title: "x y z", customer_id: "cus_nope" }, AGENT), "not_found");
  });
});
