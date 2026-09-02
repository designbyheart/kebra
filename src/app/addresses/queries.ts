import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { addressDossiers, addresses, employees, serviceTypes, type Address } from "@/db/schema";
import { SCHEDULABLE_ROLE } from "@/domain/availability";
import { buildDossierFromBundle, type AddressDossier } from "@/domain/dossier-fallback";
import { loadAddressBundle, oneLine, visitDate, windowEnd, type AddressBundle, type InvoiceWithItems, type JobWithTechs } from "@/domain/history";
import type { Note } from "@/db/schema";

export type TimelineEntry = {
  job: JobWithTechs;
  date: string | null;
  window_end: string | null;
  one_line: string;
  notes: Note[];
  invoices: InvoiceWithItems[];
};

export type AddressPageData = {
  bundle: AddressBundle;
  dossier: AddressDossier;
  /** W1-D's precomputed row when present (summary_md, generated_at, model). */
  precomputed: typeof addressDossiers.$inferSelect | null;
  /** how many service addresses the customer has (property-manager context) */
  sites_count: number;
  /** other units in the same building for the same customer */
  siblings: Pick<Address, "id" | "street" | "unit">[];
  timeline: TimelineEntry[];
  serviceTypes: { id: string; name: string; durationMinutes: number }[];
  techs: { id: string; name: string }[];
  now: Date;
};

export async function getAddressPage(addressId: string, now: Date = new Date()): Promise<AddressPageData | null> {
  const bundle = await loadAddressBundle(addressId);
  if (!bundle) return null;
  const dossier = buildDossierFromBundle(bundle, now);
  const a = bundle.address;

  const [precomputedRows, sitesRows, siblingRows, serviceRows, techRows] = await Promise.all([
    db.select().from(addressDossiers).where(eq(addressDossiers.addressId, addressId)).limit(1),
    db.select({ n: sql<number>`count(*)` }).from(addresses).where(eq(addresses.customerId, a.customerId)),
    a.houseNumber !== null && a.streetName
      ? db
          .select({ id: addresses.id, street: addresses.street, unit: addresses.unit })
          .from(addresses)
          .where(
            and(
              eq(addresses.customerId, a.customerId),
              eq(addresses.houseNumber, a.houseNumber),
              eq(addresses.streetName, a.streetName),
              sql`${addresses.id} <> ${addressId}`,
            ),
          )
          .orderBy(addresses.unit)
          .limit(12)
      : Promise.resolve([] as Pick<Address, "id" | "street" | "unit">[]),
    db
      .select({ id: serviceTypes.id, name: serviceTypes.name, durationMinutes: serviceTypes.durationMinutes })
      .from(serviceTypes)
      .where(eq(serviceTypes.active, true)),
    db
      .select({ id: employees.id, first: employees.firstName, last: employees.lastName })
      .from(employees)
      .where(and(eq(employees.role, SCHEDULABLE_ROLE), eq(employees.active, true)))
      .orderBy(employees.firstName, employees.lastName),
  ]);

  const invByJob = new Map<string, InvoiceWithItems[]>();
  for (const inv of bundle.invoices) {
    const list = invByJob.get(inv.jobId) ?? [];
    list.push(inv);
    invByJob.set(inv.jobId, list);
  }
  const timeline: TimelineEntry[] = [...bundle.jobs]
    .sort((x, y) => (visitDate(y)?.getTime() ?? 0) - (visitDate(x)?.getTime() ?? 0))
    .map((job) => {
      const notes = bundle.notesByJob.get(job.id) ?? [];
      return {
        job,
        date: visitDate(job)?.toISOString() ?? null,
        window_end: windowEnd(job)?.toISOString() ?? null,
        one_line: oneLine(notes, job.description),
        notes,
        invoices: invByJob.get(job.id) ?? [],
      };
    });

  const order = ["diagnostic", "repair", "maintenance", "callback", "estimate", "install"];
  return {
    bundle,
    dossier,
    precomputed: precomputedRows[0] ?? null,
    sites_count: Number(sitesRows[0]?.n ?? 1),
    siblings: siblingRows,
    timeline,
    serviceTypes: serviceRows.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id)),
    techs: techRows.map((t) => ({ id: t.id, name: `${t.first} ${t.last}`.trim() })),
    now,
  };
}
