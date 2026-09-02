/**
 * W2-E acceptance (docs/briefs/W2-E-cancellation-approval.md):
 *  - grader (admin) approves a fixture request → job `user canceled`, task done,
 *    event `job.cancellation_approved` with actor_label = grader's name;
 *  - an `office` user gets 403 and no approve rights;
 *  - reject restores the exact previous status and opens a callback task;
 *  - the read model builds the transcript excerpt (3 before, request highlighted).
 *
 * Runs against TEST_DATABASE_URL when set, else DATABASE_URL (same convention
 * as the W1-B suites). Every row it creates is removed afterwards.
 */
import "dotenv/config";
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  globalThis.__kebraSql = undefined;
  globalThis.__kebraDb = undefined;
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests, events, jobs, tasks, users } from "@/db/schema";
import { hashPassword, type CurrentUser } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { seedCancellationFixture, type CancellationFixture } from "@/db/seed-cancellation-fixture";
import { buildExcerpt, loadCancellationApproval, listPendingCancellations, maskPhone } from "./cancellation-data";
import { canResolveCancellations, resolveCancellationAs } from "./cancellation-resolve";

const GRADER_EMAIL = "grader@gulfbreezeair.demo";

let grader: CurrentUser;
let officeUser: CurrentUser;
let createdGrader = false;
const fixtures: CancellationFixture[] = [];

async function seed(opts?: Parameters<typeof seedCancellationFixture>[0]) {
  const fx = await seedCancellationFixture(opts);
  fixtures.push(fx);
  return fx;
}

async function userByEmail(email: string): Promise<CurrentUser | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, employeeId: users.employeeId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return u ?? null;
}

async function createUser(role: "admin" | "office", label: string): Promise<CurrentUser> {
  const id = newId("usr_w2e");
  const email = `w2e.${label}.${id.slice(-6)}@gulfbreezeair.demo`;
  const passwordHash = await hashPassword(`w2e-${id}`);
  await db.insert(users).values({ id, email, name: `W2E ${label}`, role, passwordHash });
  return { id, email, name: `W2E ${label}`, role, employeeId: null };
}

beforeAll(async () => {
  const existing = await userByEmail(GRADER_EMAIL);
  if (existing) {
    grader = existing;
  } else {
    grader = await createUser("admin", "grader");
    createdGrader = true;
  }
  officeUser = await createUser("office", "office");
}, 60_000);

afterAll(async () => {
  for (const fx of fixtures) await fx.cleanup();
  await db.delete(users).where(eq(users.id, officeUser.id));
  if (createdGrader) await db.delete(users).where(eq(users.id, grader.id));
}, 60_000);

describe("read model", () => {
  it("masks phones to the last four digits", () => {
    expect(maskPhone("+13055550123")).toBe("+1 (305) •••-0123");
    expect(maskPhone("3055550123")).toBe("(305) •••-0123");
    expect(maskPhone(null)).toBeNull();
  });

  it("builds the excerpt: 3 turns before, the request highlighted, 2 after", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "assistant" : "user") as "assistant" | "user",
      text: `turn ${i}`,
      t: i * 5,
    }));
    // requestCancellation writes {from: n, to: n} where n = length at tool time (here 6: turns 0..5 exist)
    const ex = buildExcerpt(turns, { from: 6, to: 6 });
    expect(ex.map((t) => t.index)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ex.filter((t) => t.highlight).map((t) => t.index)).toEqual([5]); // the last user turn before the tool ran
    expect(buildExcerpt([], { from: 0, to: 0 })).toEqual([]);
    expect(buildExcerpt(turns, null)).toEqual([]);
  });

  it("loads the card data for a fixture request", async () => {
    const fx = await seed({ tag: "read" });
    const data = await loadCancellationApproval(fx.changeRequestId);
    expect(data).not.toBeNull();
    expect(data!.status).toBe("pending");
    expect(data!.job.id).toBe(fx.jobId);
    expect(data!.job.workStatus).toBe("pending_cancellation");
    expect(data!.job.invoiceNumber).toMatch(/^W2E-/);
    expect(data!.job.techNames.length).toBe(fx.techId ? 1 : 0);
    expect(data!.call?.id).toBe(fx.callId);
    expect(data!.call?.callerNumberMasked).toBe("+1 (305) •••-0123");
    expect(data!.transcriptRef).toEqual({ from: 4, to: 4 });
    const hl = data!.excerpt.filter((t) => t.highlight);
    expect(hl).toHaveLength(1);
    expect(hl[0].role).toBe("user");
    expect(hl[0].text).toMatch(/cancel/i);
    expect(data!.excerpt[0].index).toBe(0); // only 3 turns before → starts at 0
    expect(data!.excerpt.at(-1)!.index).toBe(5); // 2 after the request
    expect(data!.approvers).toContain(grader.name);

    const pending = await listPendingCancellations();
    expect(pending.some((p) => p.id === fx.changeRequestId)).toBe(true);
  });
});

describe("authorization", () => {
  it("only owner/admin can resolve", () => {
    expect(canResolveCancellations(grader)).toBe(true);
    expect(canResolveCancellations(officeUser)).toBe(false);
    expect(canResolveCancellations(null)).toBe(false);
  });

  it("office user gets 403 and the job is untouched", async () => {
    const fx = await seed({ tag: "forbid" });
    const out = await resolveCancellationAs(officeUser, { action: "approve", changeRequestId: fx.changeRequestId });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(403);
    const rej = await resolveCancellationAs(officeUser, { action: "reject", changeRequestId: fx.changeRequestId, note: "nope" });
    expect(rej.ok).toBe(false);
    if (!rej.ok) expect(rej.status).toBe(403);
    const anon = await resolveCancellationAs(null, { action: "approve", changeRequestId: fx.changeRequestId });
    if (!anon.ok) expect(anon.status).toBe(401);
    const [job] = await db.select({ s: jobs.workStatus }).from(jobs).where(eq(jobs.id, fx.jobId));
    expect(job.s).toBe("pending_cancellation");
    const [cr] = await db.select({ s: changeRequests.status }).from(changeRequests).where(eq(changeRequests.id, fx.changeRequestId));
    expect(cr.s).toBe("pending");
  });

  it("reject without a note is a 400 before touching the domain", async () => {
    const fx = await seed({ tag: "nonote" });
    const out = await resolveCancellationAs(grader, { action: "reject", changeRequestId: fx.changeRequestId, note: "  " });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(400);
    const [cr] = await db.select({ s: changeRequests.status }).from(changeRequests).where(eq(changeRequests.id, fx.changeRequestId));
    expect(cr.s).toBe("pending");
  });
});

describe("approve as grader", () => {
  it("cancels the job, closes the task, emits the event with the grader's name", async () => {
    const fx = await seed({ tag: "approve" });
    const out = await resolveCancellationAs(grader, { action: "approve", changeRequestId: fx.changeRequestId });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("approved");
    expect(out.result.work_status).toBe("user canceled");

    const [job] = await db.select({ s: jobs.workStatus, canceledAt: jobs.canceledAt }).from(jobs).where(eq(jobs.id, fx.jobId));
    expect(job.s).toBe("user canceled");
    expect(job.canceledAt).not.toBeNull();

    const [cr] = await db.select().from(changeRequests).where(eq(changeRequests.id, fx.changeRequestId));
    expect(cr.status).toBe("approved");
    expect(cr.resolvedBy).toBe(grader.id);

    const openTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.jobId, fx.jobId), eq(tasks.kind, "cancellation"), eq(tasks.status, "open")));
    expect(openTasks).toHaveLength(0);

    const [ev] = await db
      .select()
      .from(events)
      .where(and(eq(events.type, "job.cancellation_approved"), eq(events.entityId, fx.jobId)))
      .orderBy(desc(events.id))
      .limit(1);
    expect(ev).toBeDefined();
    expect(ev.actor).toBe("office");
    expect(ev.actorId).toBe(grader.id);
    expect(ev.callId).toBe(fx.callId);
    expect(ev.payload.actor_label).toBe(grader.name);
    expect(ev.payload.approved_by).toBe(grader.id);
    expect(ev.payload.change_request_id).toBe(fx.changeRequestId);

    // Second approve is a no-op with a 4xx, not a crash.
    const again = await resolveCancellationAs(grader, { action: "approve", changeRequestId: fx.changeRequestId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.status).toBe(422);

    const data = await loadCancellationApproval(fx.changeRequestId);
    expect(data?.status).toBe("approved");
    expect(data?.resolvedByName).toBe(grader.name);
  });
});

describe("reject as grader", () => {
  it.each(["needs scheduling", "in progress", "scheduled"] as const)("restores %s and opens a callback task", async (status) => {
    const fx = await seed({ tag: `rej-${status.replace(/\s/g, "")}`, status });
    expect(fx.previousStatus).toBe(status);
    const note = `Tech already dispatched for the ${status} visit; offered a reschedule.`;
    const out = await resolveCancellationAs(grader, { action: "reject", changeRequestId: fx.changeRequestId, note });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("rejected");
    expect(out.result.work_status).toBe(status);
    expect(out.result.callback_task_id).toBeTruthy();

    const [job] = await db.select({ s: jobs.workStatus }).from(jobs).where(eq(jobs.id, fx.jobId));
    expect(job.s).toBe(status);

    const [cb] = await db.select().from(tasks).where(eq(tasks.id, out.result.callback_task_id!));
    expect(cb.kind).toBe("callback");
    expect(cb.status).toBe("open");
    expect(cb.jobId).toBe(fx.jobId);
    expect(cb.callId).toBe(fx.callId);
    expect(cb.body).toContain(note);

    const [ev] = await db
      .select()
      .from(events)
      .where(and(eq(events.type, "job.cancellation_rejected"), eq(events.entityId, fx.jobId)))
      .orderBy(desc(events.id))
      .limit(1);
    expect(ev.payload.actor_label).toBe(grader.name);
    expect(ev.payload.note).toBe(note);

    const data = await loadCancellationApproval(fx.changeRequestId);
    expect(data?.status).toBe("rejected");
    expect(data?.previousStatus).toBe(status);
    expect(data?.resolutionNote).toBe(note);
  });
});
