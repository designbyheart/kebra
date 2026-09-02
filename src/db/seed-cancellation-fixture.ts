/**
 * Cancellation approval fixture (W2-E).
 *
 *   pnpm exec tsx src/db/seed-cancellation-fixture.ts            # seed one, print ids
 *   pnpm exec tsx src/db/seed-cancellation-fixture.ts --clean    # remove every W2-E fixture
 *
 * Creates a throwaway customer + address + scheduled job (first active field
 * tech assigned), a call row with a transcript, then files the cancellation
 * through the real `requestCancellation` domain function so `transcript_ref`,
 * the inbox task, the note and the event are exactly what production writes.
 * Two more transcript turns are appended afterwards (the agent's "office will
 * confirm" reply) so the excerpt has context on both sides.
 *
 * Everything is tagged `W2E` in ids/names so `cleanup` never touches imported data.
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { addDays, addHours, setHours, setMinutes, startOfDay } from "date-fns";
import { eq, inArray, like, or, sql as dsql } from "drizzle-orm";
import { db, sql as pg } from "./index";
import {
  addresses,
  calls,
  changeRequests,
  customers,
  employees,
  events,
  jobAssignments,
  jobs,
  notes,
  tasks,
  type TranscriptTurn,
} from "./schema";
import { newId } from "../lib/ids";
import { fromET, toET } from "../lib/time";
import { requestCancellation } from "../domain/change-requests";

export const FIXTURE_TAG = "W2E";

export type CancellationFixtureOptions = {
  /** Distinguishes parallel fixtures in names/ids. */
  tag?: string;
  /** Job status before the request (what reject must restore). */
  status?: "scheduled" | "needs scheduling" | "in progress";
  /** ET wall-clock start; default tomorrow 10:00 ET. Ignored for `needs scheduling`. */
  start?: Date;
  reason?: string;
  callerNumber?: string;
  recordingUrl?: string | null;
};

export type CancellationFixture = {
  customerId: string;
  addressId: string;
  jobId: string;
  callId: string;
  changeRequestId: string;
  techId: string | null;
  previousStatus: "scheduled" | "needs scheduling" | "in progress";
  transcript: TranscriptTurn[];
  cleanup: () => Promise<void>;
};

function defaultStart(): Date {
  const tomorrowET = startOfDay(addDays(toET(new Date()), 1));
  return fromET(setMinutes(setHours(tomorrowET, 10), 0));
}

const BASE_TRANSCRIPT = (name: string, when: string): TranscriptTurn[] => [
  { role: "assistant", text: "Thanks for calling Gulf Breeze Air, this is the front desk. How can I help?", t: 0 },
  { role: "user", text: `Hi, this is ${name}. I have a visit booked for ${when}.`, t: 4 },
  { role: "assistant", text: `I see it — the AC maintenance ${when}. What would you like to do with it?`, t: 9 },
  { role: "user", text: "We're going to be out of town that week, so I need to cancel it. Sorry about the short notice.", t: 14 },
];

const AFTER_REQUEST: TranscriptTurn[] = [
  {
    role: "assistant",
    text: "No problem. I've passed the cancellation to the office and they'll confirm it with you shortly. Anything else?",
    t: 21,
  },
  { role: "user", text: "No, that's it. Thanks.", t: 25 },
];

export async function seedCancellationFixture(opts: CancellationFixtureOptions = {}): Promise<CancellationFixture> {
  const tag = opts.tag ?? Math.random().toString(36).slice(2, 7);
  const status = opts.status ?? "scheduled";
  const start = opts.start ?? defaultStart();
  const name = `${FIXTURE_TAG} Fixture ${tag}`;

  const customerId = newId(`cus_${FIXTURE_TAG.toLowerCase()}`);
  const addressId = newId(`adr_${FIXTURE_TAG.toLowerCase()}`);
  const jobId = newId(`job_${FIXTURE_TAG.toLowerCase()}`);
  const callId = newId(`call_${FIXTURE_TAG.toLowerCase()}`);

  await db.insert(customers).values({ id: customerId, displayName: name, kind: "homeowner", firstName: FIXTURE_TAG, lastName: tag });
  await db.insert(addresses).values({
    id: addressId,
    customerId,
    street: `${tag.toUpperCase()} Fixture Court`,
    unit: null,
    city: "Miami",
    state: "FL",
    zip: "33101",
    searchText: `${tag} fixture court miami 33101`.toLowerCase(),
  });

  const [tech] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(dsql`${employees.role} = 'field tech' and ${employees.active}`)
    .orderBy(employees.jobs)
    .limit(1);

  const scheduled = status !== "needs scheduling";
  await db.insert(jobs).values({
    id: jobId,
    invoiceNumber: `${FIXTURE_TAG}-${tag.toUpperCase()}`,
    description: "AC maintenance (fixture)",
    workStatus: status,
    scheduledStart: scheduled ? start : null,
    scheduledEnd: scheduled ? addHours(start, 2) : null,
    arrivalWindow: scheduled ? 120 : null,
    customerId,
    addressId,
    source: "agent",
    startedAt: status === "in progress" ? new Date() : null,
  });
  if (tech) await db.insert(jobAssignments).values({ jobId, employeeId: tech.id });

  const when = scheduled ? "tomorrow morning" : "sometime soon";
  const transcript = BASE_TRANSCRIPT(name, when);
  await db.insert(calls).values({
    id: callId,
    providerCallId: `${FIXTURE_TAG.toLowerCase()}-${tag}-${Date.now()}`,
    direction: "inbound",
    startedAt: new Date(Date.now() - 60_000),
    callerNumber: opts.callerNumber ?? "+13055550123",
    matchedCustomerId: customerId,
    matchedAddressId: addressId,
    status: "in_progress",
    transcript,
    recordingUrl: opts.recordingUrl ?? null,
  });

  const req = await requestCancellation(
    { job_id: jobId, reason: opts.reason ?? "Out of town that week" },
    { actor: "agent", actorId: "vapi", callId },
  );

  const full = [...transcript, ...AFTER_REQUEST];
  await db
    .update(calls)
    .set({ transcript: full, status: "ended", endedAt: new Date(), outcome: "cancellation_requested" })
    .where(eq(calls.id, callId));

  return {
    customerId,
    addressId,
    jobId,
    callId,
    changeRequestId: req.change_request_id,
    techId: tech?.id ?? null,
    previousStatus: status,
    transcript: full,
    cleanup: () => cleanupCancellationFixture({ customerId, addressId, jobId, callId }),
  };
}

/** Removes one fixture and everything the domain wrote for it. */
export async function cleanupCancellationFixture(ids: { customerId: string; addressId: string; jobId: string; callId: string }) {
  const crs = await db.select({ id: changeRequests.id }).from(changeRequests).where(eq(changeRequests.jobId, ids.jobId));
  const nts = await db.select({ id: notes.id }).from(notes).where(eq(notes.jobId, ids.jobId));
  const tks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(or(eq(tasks.jobId, ids.jobId), eq(tasks.callId, ids.callId), eq(tasks.customerId, ids.customerId)));
  const entityIds = [ids.jobId, ids.callId, ids.customerId, ids.addressId, ...crs.map((c) => c.id), ...nts.map((n) => n.id), ...tks.map((t) => t.id)];
  await db.delete(events).where(or(inArray(events.entityId, entityIds), eq(events.callId, ids.callId)));
  if (tks.length) await db.delete(tasks).where(inArray(tasks.id, tks.map((t) => t.id)));
  await db.delete(jobs).where(eq(jobs.id, ids.jobId)); // cascades notes, assignments, change_requests
  await db.delete(calls).where(eq(calls.id, ids.callId));
  await db.delete(addresses).where(eq(addresses.id, ids.addressId));
  await db.delete(customers).where(eq(customers.id, ids.customerId));
}

/** Removes every fixture this module ever created (by id prefix). */
export async function cleanupAllCancellationFixtures(): Promise<number> {
  const p = FIXTURE_TAG.toLowerCase();
  const rows = await db
    .select({ id: jobs.id, customerId: jobs.customerId, addressId: jobs.addressId })
    .from(jobs)
    .where(like(jobs.id, `job_${p}_%`));
  for (const r of rows) {
    const [call] = await db.select({ id: calls.id }).from(calls).where(eq(calls.matchedCustomerId, r.customerId)).limit(1);
    await cleanupCancellationFixture({ customerId: r.customerId, addressId: r.addressId ?? "", jobId: r.id, callId: call?.id ?? "" });
  }
  return rows.length;
}

async function main() {
  if (process.argv.includes("--clean")) {
    const n = await cleanupAllCancellationFixtures();
    console.log(`removed ${n} W2-E fixture(s)`);
    return;
  }
  const status = (process.argv.find((a) => a.startsWith("--status="))?.split("=")[1] ?? "scheduled") as CancellationFixtureOptions["status"];
  const fx = await seedCancellationFixture({ status });
  console.log(
    JSON.stringify(
      { changeRequestId: fx.changeRequestId, jobId: fx.jobId, callId: fx.callId, customerId: fx.customerId, previousStatus: fx.previousStatus },
      null,
      2,
    ),
  );
  console.log(`open http://localhost:3000/inbox/cancellations`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pg.end({ timeout: 5 }));
}
