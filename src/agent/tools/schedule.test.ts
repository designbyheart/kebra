/**
 * W1-B tool-layer tests: registration, input schemas, and phone-ready
 * speech hints. Runs against TEST_DATABASE_URL (see scheduling.test-utils).
 */
import { db, et, makeFixture, seedJob, type Fixture } from "@/domain/scheduling.test-utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { isoDateET } from "@/lib/time";
import { registry, type ToolContext } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { tools } from "./schedule";
import type { Slot } from "@/domain/availability";

const ctx: ToolContext = { callId: null, actor: "agent", actorId: "vapi" };
const NAMES = ["find_availability", "find_reschedule_slots", "book_job", "reschedule_job", "request_cancellation", "add_note", "create_task"];
let fx: Fixture;

beforeAll(async () => {
  fx = await makeFixture("tool");
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
});

async function run<T>(name: string, input: unknown, c: ToolContext = ctx): Promise<T> {
  const def = registry[name];
  const parsed = def.input.safeParse(input);
  if (!parsed.success) throw new Error(`invalid input for ${name}: ${JSON.stringify(parsed.error.issues)}`);
  return (await def.handler(parsed.data, c)) as T;
}

type Avail = { slots: Slot[]; closed_days: string[]; speech_hint: string };

describe("registration", () => {
  it("registers the six schedule tools with model-facing descriptions", () => {
    for (const n of NAMES) {
      expect(tools[n], n).toBeDefined();
      expect(registry[n]).toBe(tools[n]);
      expect(registry[n].description.length).toBeGreaterThan(80);
    }
  });

  it("marks optional inputs optional in the generated JSON schema", () => {
    const fa = z.toJSONSchema(registry.find_availability.input) as { required?: string[] };
    expect(fa.required).toEqual(expect.arrayContaining(["from", "service_type"]));
    expect(fa.required).not.toContain("limit");
    expect(fa.required).not.toContain("to");
    const bj = z.toJSONSchema(registry.book_job.input) as { required?: string[] };
    expect(bj.required).not.toContain("idempotency_key");
  });

  it("validates inputs", () => {
    expect(registry.find_availability.input.safeParse({ from: "2026-09-03", service_type: "haircut" }).success).toBe(false);
    expect(registry.find_availability.input.safeParse({ from: "next tuesday", service_type: "repair" }).success).toBe(false);
    expect(registry.find_availability.input.safeParse({ from: "2026-09-03", service_type: "repair" }).success).toBe(true);
    expect(registry.find_availability.input.safeParse({ from: "2026-09-03T14:00:00-04:00", to: "2026-09-05", service_type: "repair", limit: 2 }).success).toBe(true);
    expect(registry.find_reschedule_slots.input.safeParse({ job_id: "job_x", from: "2026-09-03" }).success).toBe(true);
    expect(registry.find_reschedule_slots.input.safeParse({ from: "2026-09-03" }).success).toBe(false);
    expect(registry.add_note.input.safeParse({ content: "hello there" }).success).toBe(false);
    expect(registry.add_note.input.safeParse({ address_id: "adr_x", content: "hello there" }).success).toBe(true);
    expect(registry.book_job.input.safeParse({ customer_id: "c", address_id: "a", service_type: "repair", window_start: "2026-09-03T14:00:00Z", employee_id: "e", issue_summary: "no cool", caller_phone: "305-555-0142" }).success).toBe(false);
    expect(registry.book_job.input.safeParse({ customer_id: "c", address_id: "a", service_type: "repair", window_start: "2026-09-03T14:00:00Z", employee_id: "e", issue_summary: "no cool", caller_phone: "+13055550142" }).success).toBe(true);
    expect(registry.create_task.input.safeParse({ kind: "cancellation", title: "nope nope" }).success).toBe(false);
    expect(registry.request_cancellation.input.safeParse({ job_id: "j" }).success).toBe(false);
  });
});

describe("find_availability tool", () => {
  it("returns slots for today with a phone-ready speech hint", async () => {
    const r = await run<Avail>("find_availability", { from: isoDateET(new Date()), service_type: "diagnostic" });
    expect(r.slots.length).toBeGreaterThanOrEqual(3);
    expect(r.speech_hint).toMatch(/^I have .+ with [A-Z][a-z]+/);
    expect(r.speech_hint).toMatch(/Which works better for you\?$|Does that work for you\?$/);
    // "between 10 and noon" / "1 to 3" style, never "10:00 AM".
    expect(r.speech_hint).not.toMatch(/\d:\d\d/);
    const perDay = new Map<string, number>();
    for (const s of r.slots) {
      expect(new Date(s.window_start) > new Date()).toBe(true);
      expect(s.window_label).toMatch(/^[A-Z][a-z]+day [A-Z][a-z]+ \d{1,2}, .+ to .+$/);
      perDay.set(isoDateET(s.window_start), (perDay.get(isoDateET(s.window_start)) ?? 0) + 1);
    }
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
    console.log("[sample find_availability today]", JSON.stringify({ input: { from: isoDateET(new Date()), service_type: "diagnostic" }, ...r }, null, 2));
  });

  it("says so when nothing is open (Sunday)", async () => {
    const r = await run<Avail>("find_availability", { from: "2026-10-04", to: "2026-10-04", service_type: "diagnostic" });
    expect(r.slots).toEqual([]);
    expect(r.closed_days).toEqual(["2026-10-04"]);
    expect(r.speech_hint).toMatch(/don't have anything open|don't have any openings/);
  });
});

describe("find_reschedule_slots tool", () => {
  it("returns slots for an existing job using its service type and current tech", async () => {
    const avail = await run<Avail>("find_availability", { from: "2026-10-21", to: "2026-10-21", service_type: "repair", address_id: fx.addressId });
    const slot = avail.slots[0];
    const booked = await run<{ job_id: string }>("book_job", {
      customer_id: fx.customerId,
      address_id: fx.addressId,
      service_type: "repair",
      window_start: slot.window_start,
      employee_id: slot.employee_id,
      issue_summary: "Compressor short-cycling",
      caller_phone: "+13055550177",
    });
    fx.jobIds.add(booked.job_id);

    const r = await run<{ job_id: string; job_summary: { status: string; old_window_label: string; service_type: string; current_tech_name: string }; slots: Slot[]; closed_days: string[]; speech_hint: string }>("find_reschedule_slots", {
      job_id: booked.job_id,
      from: "2026-10-22",
      to: "2026-10-22",
    });
    expect(r.job_id).toBe(booked.job_id);
    expect(r.job_summary.status).toBe("scheduled");
    expect(r.job_summary.old_window_label).toMatch(/^[A-Z][a-z]+day [A-Z][a-z]+ \d{1,2}/);
    expect(r.job_summary.service_type).toBe("repair");
    expect(r.job_summary.current_tech_name).toBe(slot.employee_name);
    expect(r.slots.length).toBeGreaterThan(0);
    expect(r.slots[0].employee_id).toBe(slot.employee_id);
    expect(r.speech_hint).toMatch(/^I have .+ with [A-Z][a-z]+/);
    expect(r.speech_hint).not.toMatch(/\d:\d\d/);
  });

  it("still offers windows when the job has no service type (imported jobs)", async () => {
    // seedJob writes the imported shape: a booked window and no service type.
    const tech = fx.byName("Felix");
    const jobId = await seedJob(fx, { employeeIds: [tech.id], start: et("2026-10-21", "08:00"), durationMin: 120 });

    const r = await run<{ job_summary: { service_type: string | null }; slots: Slot[]; speech_hint: string }>("find_reschedule_slots", {
      job_id: jobId,
      from: "2026-10-22",
      to: "2026-10-22",
    });
    expect(r.job_summary.service_type).toBeNull();
    expect(r.slots.length).toBeGreaterThan(0);
    expect(r.slots[0].employee_id).toBe(tech.id);
    expect(r.speech_hint).toMatch(/^I have .+ with [A-Z][a-z]+/);
  });

  it("sizes those windows from the existing booking, not a default", async () => {
    // Hours are 8-18, so a full-day visit can only start by 10, a short one by 16.
    const tech = fx.byName("Felix");
    const long = await seedJob(fx, { employeeIds: [tech.id], start: et("2026-10-19", "08:00"), durationMin: 480 });
    const short = await seedJob(fx, { employeeIds: [tech.id], start: et("2026-10-20", "08:00"), durationMin: 60 });

    const lastStart = async (jobId: string) => {
      const r = await run<{ slots: Slot[] }>("find_reschedule_slots", { job_id: jobId, from: "2026-10-22", to: "2026-10-22", limit: 8 });
      return r.slots.map((s) => s.window_start).sort().at(-1)!;
    };
    expect(await lastStart(long)).toBe(et("2026-10-22", "10:00").toISOString());
    expect(await lastStart(short)).toBe(et("2026-10-22", "16:00").toISOString());
  });

  it("returns not_found for a missing job", async () => {
    let caught: ToolError | null = null;
    try {
      await run("find_reschedule_slots", { job_id: "job_nope", from: "2026-10-22" });
    } catch (e) {
      caught = e as ToolError;
    }
    expect(caught?.code).toBe("not_found");
    expect(caught?.speechHint).toMatch(/can't find that visit/);
  });
});

describe("write tools through the registry", () => {
  it("book → reschedule → add_note → request_cancellation → create_task, with speech hints", async () => {
    const avail = await run<Avail>("find_availability", { from: "2026-10-19", to: "2026-10-19", service_type: "repair", address_id: fx.addressId });
    const slot = avail.slots[0];
    const booked = await run<{ job_id: string; invoice_number: string; confirmation_line: string; speech_hint: string }>("book_job", {
      customer_id: fx.customerId,
      address_id: fx.addressId,
      service_type: "repair",
      window_start: slot.window_start,
      employee_id: slot.employee_id,
      issue_summary: "Compressor short-cycling",
      caller_phone: "+13055550177",
      access_notes: "Lockbox 2468 by the side door",
      idempotency_key: `${fx.keyPrefix}tool-book`,
    });
    fx.jobIds.add(booked.job_id);
    expect(booked.speech_hint).toBe(booked.confirmation_line);
    expect(booked.speech_hint).not.toContain("2468");
    expect(booked.speech_hint).toMatch(/Your confirmation number is \d+\./);

    // Same slot again → slot_taken with a speakable hint.
    let caught: ToolError | null = null;
    try {
      await run("book_job", { customer_id: fx.customerId, address_id: fx.addressId, service_type: "repair", window_start: slot.window_start, employee_id: slot.employee_id, issue_summary: "dup" });
    } catch (e) {
      caught = e as ToolError;
    }
    expect(caught?.code).toBe("slot_taken");
    expect(caught?.speechHint).toMatch(/just got booked/);

    const moved = await run<{ new_window_label: string; speech_hint: string }>("reschedule_job", {
      job_id: booked.job_id,
      new_window_start: et("2026-10-20", "13:00").toISOString(),
      reason: "Caller prefers Tuesday afternoon",
    });
    expect(moved.new_window_label).toBe("Tuesday October 20, 1 PM to 3 PM");
    expect(moved.speech_hint).toMatch(/^Done\. I've moved it to /);

    const note = await run<{ note_id: string; speech_hint: string }>("add_note", { job_id: booked.job_id, content: "Please call 15 minutes before arriving" });
    expect(note.note_id).toMatch(/^nte_/);
    expect(note.speech_hint).toMatch(/added that/);

    const cancel = await run<{ change_request_id: string; status: string; speech_hint: string }>("request_cancellation", { job_id: booked.job_id, reason: "Found another company" });
    expect(cancel.status).toBe("pending");
    expect(cancel.speech_hint).toMatch(/office/);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, booked.job_id));
    expect(job.workStatus).toBe("pending_cancellation");

    const task = await run<{ task_id: string; speech_hint: string }>("create_task", { kind: "handoff", title: "Billing question about last invoice", customer_id: fx.customerId, job_id: booked.job_id });
    fx.taskIds.add(task.task_id);
    expect(task.speech_hint).toMatch(/office/);
  });
});
