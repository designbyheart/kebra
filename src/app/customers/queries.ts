import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  addresses,
  calls,
  customerDossiers,
  customerPhones,
  customers,
  jobs,
  type Call,
  type Customer,
} from "@/db/schema";

type CustomerPhone = typeof customerPhones.$inferSelect;
import { findAddress, findCustomer, type AddressCandidate } from "@/domain/search";
import {
  OPEN_STATUSES,
  addressLabel,
  getOpenBalance,
  loadInvoices,
  loadTechs,
  visitDate,
  windowEnd,
  type InvoiceWithItems,
  type OpenBalance,
} from "@/domain/history";

// ---------------------------------------------------------------------------
// /customers list
// ---------------------------------------------------------------------------

export type CustomerRow = {
  id: string;
  display_name: string;
  kind: string | null;
  company: string | null;
  job_count: number;
  last_job_at: string | null;
  sites_count: number;
  open_balance_cents: number;
  /** only when the row came from a search */
  confidence?: number;
  matched_by?: "phone" | "name";
};

type RawCustomerRow = {
  id: string;
  display_name: string;
  kind: string | null;
  company: string | null;
  job_count: number | string;
  last_job: Date | string | null;
  sites_count: number | string;
  open_balance: number | string;
};

const RECENT_LIMIT = 60;

async function customerRows(ids: string[] | null): Promise<CustomerRow[]> {
  const rows = (await db.execute(sql`
    select c.id, c.display_name, c.kind, c.company, c.job_count, c.last_job,
      (select count(*) from addresses a where a.customer_id = c.id) as sites_count,
      (select coalesce(sum(j.outstanding_balance), 0) from jobs j where j.customer_id = c.id) as open_balance
    from customers c
    ${ids ? sql`where c.id in ${ids}` : sql``}
    order by c.last_job desc nulls last, c.display_name
    ${ids ? sql`` : sql`limit ${RECENT_LIMIT}`}
  `)) as unknown as RawCustomerRow[];
  return rows.map((r) => ({
    id: r.id,
    display_name: r.display_name,
    kind: r.kind,
    company: r.company,
    job_count: Number(r.job_count),
    last_job_at: r.last_job ? new Date(r.last_job).toISOString() : null,
    sites_count: Number(r.sites_count),
    open_balance_cents: Number(r.open_balance),
  }));
}

export type CustomerSearchResult = {
  query: string;
  customers: CustomerRow[];
  addresses: AddressCandidate[];
  /** true when the list is the default "recent" view */
  recent: boolean;
};

/** Search by name / company / phone (findCustomer) and by address (findAddress); recent customers when empty. */
export async function searchCustomers(query: string): Promise<CustomerSearchResult> {
  const q = query.trim();
  if (!q) return { query: "", customers: await customerRows(null), addresses: [], recent: true };

  const looksLikePhone = /^\+?[\d\s().-]{7,}$/.test(q);
  const phone = looksLikePhone ? toE164(q) : null;
  const [byName, byAddress] = await Promise.all([
    findCustomer(phone ? { phone, limit: 10 } : { name: q, limit: 10 }),
    looksLikePhone ? Promise.resolve(null) : findAddress(q, { limit: 8 }).catch(() => null),
  ]);
  const ids = byName.map((c) => c.customer_id);
  const rows = ids.length ? await customerRows(ids) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const customersOut: CustomerRow[] = [];
  for (const c of byName) {
    const row = byId.get(c.customer_id);
    if (row) customersOut.push({ ...row, confidence: c.confidence, matched_by: c.matched_by });
  }
  return { query: q, customers: customersOut, addresses: byAddress?.candidates ?? [], recent: false };
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// ---------------------------------------------------------------------------
// /customers/[id]
// ---------------------------------------------------------------------------

export type SiteRow = {
  id: string;
  label: string;
  street: string;
  unit: string | null;
  city: string | null;
  zip: string | null;
  job_count: number;
  last_visit_at: string | null;
  next_visit_at: string | null;
  open_balance_cents: number;
};

export type UpcomingRow = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  work_status: (typeof jobs.$inferSelect)["workStatus"];
  priority: (typeof jobs.$inferSelect)["priority"];
  source: (typeof jobs.$inferSelect)["source"];
  window_start: string | null;
  window_end: string | null;
  address_id: string | null;
  address_label: string | null;
  tech_names: string[];
};

export type InvoiceGroup = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  visit_date: string | null;
  address_label: string | null;
  outstanding_cents: number;
  invoices: InvoiceWithItems[];
};

export type CustomerDetail = {
  customer: Customer;
  phones: CustomerPhone[];
  dossier: typeof customerDossiers.$inferSelect | null;
  balance: OpenBalance;
  sites: SiteRow[];
  upcoming: UpcomingRow[];
  invoiceGroups: InvoiceGroup[];
  calls: Pick<Call, "id" | "startedAt" | "endedAt" | "direction" | "status" | "outcome" | "summary" | "needsReview">[];
  now: Date;
};

type RawSite = {
  id: string;
  street: string;
  unit: string | null;
  city: string | null;
  zip: string | null;
  job_count: number | string;
  last_visit_at: Date | string | null;
  next_visit_at: Date | string | null;
  open_balance: number | string;
};

export async function getCustomerDetail(id: string, now: Date = new Date()): Promise<CustomerDetail | null> {
  const [cust] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!cust) return null;

  const [phones, dossierRows, balance, siteRows, upcomingRows, recentJobs, callRows] = await Promise.all([
    db.select().from(customerPhones).where(eq(customerPhones.customerId, id)).orderBy(desc(customerPhones.lastSeenAt)),
    db.select().from(customerDossiers).where(eq(customerDossiers.customerId, id)).limit(1),
    getOpenBalance(id),
    db.execute(sql`
      select a.id, a.street, a.unit, a.city, a.zip,
        (select count(*) from jobs j where j.address_id = a.id) as job_count,
        (select max(coalesce(j.completed_at, j.started_at, j.scheduled_start)) from jobs j
           where j.address_id = a.id and j.work_status in ('complete rated','complete unrated','in progress')) as last_visit_at,
        (select min(j.scheduled_start) from jobs j
           where j.address_id = a.id and j.scheduled_start >= ${now.toISOString()}::timestamptz
             and j.work_status in ('scheduled','needs scheduling','in progress','pending_cancellation')) as next_visit_at,
        (select coalesce(sum(j.outstanding_balance), 0) from jobs j where j.address_id = a.id) as open_balance
      from addresses a
      where a.customer_id = ${id}
      order by last_visit_at desc nulls last, a.street, a.unit
    `) as unknown as Promise<RawSite[]>,
    db
      .select({ job: jobs, address: addresses })
      .from(jobs)
      .leftJoin(addresses, eq(addresses.id, jobs.addressId))
      .where(
        and(
          eq(jobs.customerId, id),
          gte(jobs.scheduledStart, now),
          inArray(jobs.workStatus, [...OPEN_STATUSES, "pending_cancellation"]),
        ),
      )
      .orderBy(jobs.scheduledStart)
      .limit(12),
    db
      .select({ job: jobs, address: addresses })
      .from(jobs)
      .leftJoin(addresses, eq(addresses.id, jobs.addressId))
      .where(eq(jobs.customerId, id))
      .orderBy(desc(sql`coalesce(${jobs.completedAt}, ${jobs.startedAt}, ${jobs.scheduledStart}, ${jobs.createdAt})`))
      .limit(40),
    db
      .select({
        id: calls.id,
        startedAt: calls.startedAt,
        endedAt: calls.endedAt,
        direction: calls.direction,
        status: calls.status,
        outcome: calls.outcome,
        summary: calls.summary,
        needsReview: calls.needsReview,
      })
      .from(calls)
      .where(eq(calls.matchedCustomerId, id))
      .orderBy(desc(calls.startedAt))
      .limit(10),
  ]);

  const upcomingIds = upcomingRows.map((r) => r.job.id);
  const recentIds = recentJobs.map((r) => r.job.id);
  const [techMap, invs] = await Promise.all([loadTechs(upcomingIds), loadInvoices(recentIds)]);
  const invByJob = new Map<string, InvoiceWithItems[]>();
  for (const inv of invs) {
    const list = invByJob.get(inv.jobId) ?? [];
    list.push(inv);
    invByJob.set(inv.jobId, list);
  }

  return {
    customer: cust,
    phones,
    dossier: dossierRows[0] ?? null,
    balance: balance ?? { customer_id: id, customer_name: cust.displayName, total_cents: 0, invoices: [] },
    sites: siteRows.map((s) => ({
      id: s.id,
      label: addressLabel(s),
      street: s.street,
      unit: s.unit,
      city: s.city,
      zip: s.zip,
      job_count: Number(s.job_count),
      last_visit_at: s.last_visit_at ? new Date(s.last_visit_at).toISOString() : null,
      next_visit_at: s.next_visit_at ? new Date(s.next_visit_at).toISOString() : null,
      open_balance_cents: Number(s.open_balance),
    })),
    upcoming: upcomingRows.map(({ job, address }) => ({
      job_id: job.id,
      invoice_number: job.invoiceNumber,
      description: job.description,
      work_status: job.workStatus,
      priority: job.priority,
      source: job.source,
      window_start: job.scheduledStart?.toISOString() ?? null,
      window_end: windowEnd(job)?.toISOString() ?? null,
      address_id: address?.id ?? null,
      address_label: address ? addressLabel(address) : null,
      tech_names: (techMap.get(job.id) ?? []).map((t) => t.name),
    })),
    invoiceGroups: recentJobs
      .map(({ job, address }) => ({
        job_id: job.id,
        invoice_number: job.invoiceNumber,
        description: job.description,
        visit_date: visitDate(job)?.toISOString() ?? null,
        address_label: address ? addressLabel(address) : null,
        outstanding_cents: job.outstandingBalance,
        invoices: invByJob.get(job.id) ?? [],
      }))
      .filter((g) => g.invoices.length > 0),
    calls: callRows,
    now,
  };
}
