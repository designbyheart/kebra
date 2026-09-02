/**
 * Test plumbing for the W1-B suites. Import this module FIRST in a test file.
 *
 * - Points `@/db` at TEST_DATABASE_URL when set (falls back to DATABASE_URL).
 *   `db` is lazy, so flipping the env before the first query is enough; the
 *   globals are cleared in case a pooled worker already opened a client.
 * - Creates a throwaway customer + address and tracks every row a test
 *   creates so `cleanup()` removes exactly those (never imported data).
 */
import "dotenv/config";
import { eq, inArray, sql as dsql } from "drizzle-orm";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  globalThis.__kebraSql = undefined;
  globalThis.__kebraDb = undefined;
}

// Imported after the env switch on purpose (the client is lazy anyway).
import { db } from "@/db";
import {
  addresses,
  changeRequests,
  customerPhones,
  customers,
  employees,
  events,
  idempotencyKeys,
  jobAssignments,
  jobs,
  notes,
  tasks,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "@/lib/time";

export type Fixture = {
  customerId: string;
  addressId: string;
  techs: { id: string; name: string; jobs: number }[];
  byName: (first: string) => { id: string; name: string; jobs: number };
  jobIds: Set<string>;
  taskIds: Set<string>;
  keyPrefix: string;
  cleanup: () => Promise<void>;
};

/** ET wall clock → instant, e.g. et("2026-09-21", "10:00"). */
export function et(date: string, hhmm: string): Date {
  return fromZonedTime(`${date}T${hhmm}:00`, BUSINESS_TZ);
}

export async function makeFixture(tag: string): Promise<Fixture> {
  const customerId = newId(`cus_w1b${tag}`);
  const addressId = newId(`adr_w1b${tag}`);
  await db.insert(customers).values({ id: customerId, displayName: `W1B Test ${tag}`, kind: "homeowner", firstName: "W1B", lastName: tag });
  await db.insert(addresses).values({
    id: addressId,
    customerId,
    street: `${tag} Test Harbor Lane`,
    unit: null,
    city: "Miami",
    state: "FL",
    zip: "33101",
    searchText: `${tag} test harbor lane miami 33101`.toLowerCase(),
  });
  const techRows = await db
    .select({ id: employees.id, first: employees.firstName, last: employees.lastName, jobs: employees.jobs })
    .from(employees)
    .where(dsql`${employees.role} = 'field tech' and ${employees.active}`);
  const techs = techRows.map((t) => ({ id: t.id, name: `${t.first} ${t.last}`, jobs: t.jobs }));
  const jobIds = new Set<string>();
  const taskIds = new Set<string>();
  const keyPrefix = `w1b-${tag}-`;

  return {
    customerId,
    addressId,
    techs,
    byName: (first) => {
      const t = techs.find((x) => x.name.startsWith(`${first} `));
      if (!t) throw new Error(`no field tech named ${first}`);
      return t;
    },
    jobIds,
    taskIds,
    keyPrefix,
    cleanup: async () => {
      // Anything the domain created for this customer (source agent/office).
      const mine = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(dsql`${jobs.customerId} = ${customerId} and ${jobs.source} in ('agent','office')`);
      for (const j of mine) jobIds.add(j.id);
      const ids = [...jobIds];
      if (ids.length) {
        const crs = await db.select({ id: changeRequests.id }).from(changeRequests).where(inArray(changeRequests.jobId, ids));
        const nts = await db.select({ id: notes.id }).from(notes).where(inArray(notes.jobId, ids));
        const tks = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.jobId, ids));
        for (const t of tks) taskIds.add(t.id);
        const entityIds = [...ids, ...crs.map((c) => c.id), ...nts.map((n) => n.id), ...taskIds];
        if (entityIds.length) await db.delete(events).where(inArray(events.entityId, entityIds));
        if (taskIds.size) await db.delete(tasks).where(inArray(tasks.id, [...taskIds]));
        await db.delete(jobs).where(inArray(jobs.id, ids)); // cascades notes, assignments, change_requests, invoices
      } else if (taskIds.size) {
        await db.delete(events).where(inArray(events.entityId, [...taskIds]));
        await db.delete(tasks).where(inArray(tasks.id, [...taskIds]));
      }
      await db.delete(idempotencyKeys).where(dsql`${idempotencyKeys.key} like ${keyPrefix + "%"}`);
      await db.delete(customerPhones).where(eq(customerPhones.customerId, customerId));
      await db.delete(events).where(inArray(events.entityId, [customerId, addressId]));
      await db.delete(addresses).where(eq(addresses.id, addressId));
      await db.delete(customers).where(eq(customers.id, customerId));
    },
  };
}

/**
 * Insert a blocking (or completed) job directly, bypassing the domain, to
 * shape a day. Tracked for cleanup.
 */
export async function seedJob(
  fx: Fixture,
  opts: {
    employeeIds: string[];
    start: Date;
    durationMin?: number;
    status?: "scheduled" | "in progress" | "pending_cancellation" | "needs scheduling" | "complete rated" | "complete unrated" | "user canceled";
    completedAt?: Date;
    addressId?: string;
  },
): Promise<string> {
  const id = newId("job");
  const status = opts.status ?? "scheduled";
  await db.insert(jobs).values({
    id,
    invoiceNumber: null,
    description: "W1B fixture",
    workStatus: status,
    scheduledStart: opts.start,
    scheduledEnd: addMinutes(opts.start, opts.durationMin ?? 60),
    arrivalWindow: 120,
    customerId: fx.customerId,
    addressId: opts.addressId ?? fx.addressId,
    source: "agent",
    completedAt: opts.completedAt ?? (status.startsWith("complete") ? addMinutes(opts.start, 90) : null),
  });
  if (opts.employeeIds.length) {
    await db.insert(jobAssignments).values(opts.employeeIds.map((employeeId) => ({ jobId: id, employeeId })));
  }
  fx.jobIds.add(id);
  return id;
}

export { db };
