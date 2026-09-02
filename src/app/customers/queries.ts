import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
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

import { findAddress, findCustomer, type AddressCandidate } from "@/domain/search";

type CustomerPhone = typeof customerPhones.$inferSelect;

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

export type CustomerFilters = {
  kinds?: string[];
  balanceMin?: number; // cents
  balanceMax?: number; // cents
  jobsMin?: number;
  jobsMax?: number;
  sitesMin?: number;
  sitesMax?: number;
};

export type CustomerSortColumn = "name" | "kind" | "sites" | "jobs" | "last_job" | "balance" | "match";
export type CustomerSort = { column: CustomerSortColumn; direction: "asc" | "desc" };

function validKind(kind: string): boolean {
  return kind === "business" || kind === "homeowner";
}

function normalizedFilters(input: CustomerFilters): CustomerFilters {
  const out: CustomerFilters = {};
  if (input.kinds?.length) out.kinds = input.kinds.filter(validKind);
  if (input.balanceMin !== undefined && !Number.isNaN(input.balanceMin)) out.balanceMin = Math.max(0, input.balanceMin);
  if (input.balanceMax !== undefined && !Number.isNaN(input.balanceMax)) out.balanceMax = Math.max(0, input.balanceMax);
  if (input.jobsMin !== undefined && !Number.isNaN(input.jobsMin)) out.jobsMin = Math.max(0, input.jobsMin);
  if (input.jobsMax !== undefined && !Number.isNaN(input.jobsMax)) out.jobsMax = Math.max(0, input.jobsMax);
  if (input.sitesMin !== undefined && !Number.isNaN(input.sitesMin)) out.sitesMin = Math.max(0, input.sitesMin);
  if (input.sitesMax !== undefined && !Number.isNaN(input.sitesMax)) out.sitesMax = Math.max(0, input.sitesMax);
  return out;
}

function rangeCondition(
  valueColumn: SQL,
  min: number | undefined,
  max: number | undefined,
): SQL | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) {
    return min <= max
      ? sql`${valueColumn} between ${min} and ${max}`
      : sql`${valueColumn} between ${max} and ${min}`;
  }
  if (min !== undefined) return sql`${valueColumn} >= ${min}`;
  return sql`${valueColumn} <= ${max}`;
}

function buildWhere(ids: string[] | null, filters: CustomerFilters): SQL {
  const conditions: SQL[] = [];
  if (ids && ids.length) {
    conditions.push(sql`c.id in ${ids}`);
  }
  if (filters.kinds?.length) {
    conditions.push(sql`c.kind in ${filters.kinds}`);
  }
  const jobsCond = rangeCondition(sql`c.job_count`, filters.jobsMin, filters.jobsMax);
  if (jobsCond) conditions.push(jobsCond);
  return conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
}

function buildOrderBy(column: CustomerSortColumn, direction: "asc" | "desc"): SQL {
  const dir = direction === "asc" ? sql`asc` : sql`desc`;
  switch (column) {
    case "name":
      return sql`display_name ${dir}`;
    case "kind":
      return sql`kind nulls last ${dir}, display_name asc`;
    case "sites":
      return sql`sites_count ${dir}, display_name asc`;
    case "jobs":
      return sql`job_count ${dir}, display_name asc`;
    case "last_job":
      return sql`last_job ${dir} nulls last, display_name asc`;
    case "balance":
      return sql`open_balance ${dir}, display_name asc`;
    case "match":
      return sql`display_name asc`;
  }
}

function buildOuterWhere(filters: CustomerFilters): SQL {
  const conditions: SQL[] = [];
  const sitesCond = rangeCondition(sql`sites_count`, filters.sitesMin, filters.sitesMax);
  if (sitesCond) conditions.push(sitesCond);
  const balanceCond = rangeCondition(sql`open_balance`, filters.balanceMin, filters.balanceMax);
  if (balanceCond) conditions.push(balanceCond);
  return conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
}

async function customerRows(
  ids: string[] | null,
  filters: CustomerFilters,
  sort: CustomerSort,
): Promise<CustomerRow[]> {
  const where = buildWhere(ids, filters);
  const outerWhere = buildOuterWhere(filters);
  const orderBy = buildOrderBy(sort.column, sort.direction);
  const limitClause = ids ? sql`` : sql`limit ${RECENT_LIMIT}`;

  const rows = (await db.execute(sql`
    with base as (
      select
        c.id,
        c.display_name,
        c.kind,
        c.company,
        c.job_count,
        c.last_job,
        (select count(*) from addresses a where a.customer_id = c.id) as sites_count,
        (select coalesce(sum(j.outstanding_balance), 0) from jobs j where j.customer_id = c.id) as open_balance
      from customers c
      ${where}
    )
    select * from base
    ${outerWhere}
    order by ${orderBy}
    ${limitClause}
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
  filters: CustomerFilters;
  sort: CustomerSort;
  /** distinct customer kinds available for the filter UI */
  availableKinds: string[];
};

const DEFAULT_RECENT_SORT: CustomerSort = { column: "last_job", direction: "desc" };

/** Search by name / company / phone (findCustomer) and by address (findAddress); recent customers when empty. */
export async function searchCustomers(
  query: string,
  filters: CustomerFilters = {},
  sort: CustomerSort | null = null,
): Promise<CustomerSearchResult> {
  const q = query.trim();
  const normalized = normalizedFilters(filters);

  if (!q) {
    const activeSort = sort ?? DEFAULT_RECENT_SORT;
    return {
      query: "",
      customers: await customerRows(null, normalized, activeSort),
      addresses: [],
      recent: true,
      filters: normalized,
      sort: activeSort,
      availableKinds: ["business", "homeowner"],
    };
  }

  const looksLikePhone = /^\+?[\d\s().-]{7,}$/.test(q);
  const phone = looksLikePhone ? toE164(q) : null;
  const [byName, byAddress] = await Promise.all([
    findCustomer(phone ? { phone, limit: 10 } : { name: q, limit: 10 }),
    looksLikePhone ? Promise.resolve(null) : findAddress(q, { limit: 8 }).catch(() => null),
  ]);

  const ids = byName.map((c) => c.customer_id);
  const preserveMatchOrder = !sort || sort.column === "match";
  const sqlSort: CustomerSort = preserveMatchOrder
    ? { column: "name", direction: "asc" }
    : sort;

  const rows = ids.length ? await customerRows(ids, normalized, sqlSort) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  let customersOut: CustomerRow[] = [];
  if (preserveMatchOrder) {
    for (const c of byName) {
      const row = byId.get(c.customer_id);
      if (row) customersOut.push({ ...row, confidence: c.confidence, matched_by: c.matched_by });
    }
  } else {
    customersOut = rows.map((r) => {
      const hit = byName.find((c) => c.customer_id === r.id);
      return { ...r, confidence: hit?.confidence, matched_by: hit?.matched_by };
    });
  }

  return {
    query: q,
    customers: customersOut,
    addresses: byAddress?.candidates ?? [],
    recent: false,
    filters: normalized,
    sort: sort ?? { column: "match", direction: "desc" },
    availableKinds: ["business", "homeowner"],
  };
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
