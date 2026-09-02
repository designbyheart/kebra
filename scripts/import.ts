/**
 * pnpm import — load front-desk-assignment/data/*.jsonl into Postgres.
 *
 * Idempotent upsert (INSERT ... ON CONFLICT DO UPDATE) keyed on the source
 * ids, in one transaction. Upsert rather than truncate because the local
 * database is shared with other units that add rows (agent-booked jobs,
 * notes, tasks) referencing the imported ones. Re-running restores imported
 * rows to the file's state and removes imported jobs no longer in the file
 * (source = 'import' only); platform-created rows are never touched.
 *
 * Emits one `system.import` event and prints the counts.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db, sql as pg, type Db } from "../src/db";
import {
  addresses,
  customers,
  employees,
  invoiceItems,
  invoices,
  jobAssignments,
  jobs,
  notes,
  workStatusEnum,
} from "../src/db/schema";
import { emitEvent } from "../src/lib/events";
import { buildSearchText, normalizeAddress, parseStreet } from "../src/lib/address-normalize";

// ---------------------------------------------------------------------------
// Source shapes (only the fields we read)
// ---------------------------------------------------------------------------

type SrcAddress = {
  id: string | null;
  street: string | null;
  street_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
};
type SrcCustomerRef = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  kind: string | null;
};
type SrcJob = {
  id: string;
  invoice_number: string | null;
  description: string | null;
  work_status: string;
  work_timestamps: { on_my_way_at: string | null; started_at: string | null; completed_at: string | null };
  schedule: { scheduled_start: string | null; scheduled_end: string | null; arrival_window: number | null };
  tags: string[];
  lead_source: string | null;
  total_amount: number;
  outstanding_balance: number;
  created_at: string | null;
  updated_at: string | null;
  canceled_at: string | null;
  customer: SrcCustomerRef;
  address: SrcAddress;
  assigned_employees: { id: string; first_name: string; last_name: string }[];
  notes: { id: string; content: string | null }[];
};
type SrcCustomer = SrcCustomerRef & {
  addresses: SrcAddress[];
  job_count: number;
  first_job: string | null;
  last_job: string | null;
};
type SrcEmployee = { id: string; first_name: string; last_name: string; role: string; jobs: number };
type SrcInvoice = {
  id: string;
  job_id: string;
  invoice_number: string | null;
  status: string | null;
  amount: number;
  subtotal: number;
  due_amount: number;
  paid_at: string | null;
  sent_at: string | null;
  service_date: string | null;
  invoice_date: string | null;
  items: {
    id: string;
    name: string | null;
    type: string | null;
    unit_price: number;
    qty_in_hundredths: number;
    amount: number;
  }[];
};

export const DATA_DIR = path.resolve(process.cwd(), "front-desk-assignment/data");

export type ImportCounts = {
  employees: number;
  customers: number;
  addresses: number;
  jobs: number;
  job_assignments: number;
  notes: number;
  invoices: number;
  invoice_items: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readJsonl<T>(file: string): Promise<T[]> {
  const rows: T[] = [];
  const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t) rows.push(JSON.parse(t) as T);
  }
  return rows;
}

const date = (s: string | null | undefined): Date | null => (s ? new Date(s) : null);
const cents = (n: number | null | undefined): number => Math.round(Number(n ?? 0));

/**
 * company if set, else "First Last", else whichever name is present. A few
 * source customers have none of the three; they are named by their first
 * service address so the agent still has something to say.
 */
export function displayNameFor(
  c: { first_name: string | null; last_name: string | null; company: string | null },
  fallbackStreet?: string | null,
): string {
  const company = c.company?.trim();
  if (company) return company;
  const full = [c.first_name, c.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  if (full) return full;
  const street = fallbackStreet?.trim();
  return street ? `Customer at ${street}` : "Unknown customer";
}

const WORK_STATUSES = new Set<string>(workStatusEnum.enumValues);
type WorkStatus = (typeof workStatusEnum.enumValues)[number];
function workStatus(s: string): WorkStatus {
  if (WORK_STATUSES.has(s)) return s as WorkStatus;
  throw new Error(`unknown work_status in source data: ${JSON.stringify(s)}`);
}

/** Deterministic id for the handful of source addresses that have none. */
function syntheticAddressId(customerId: string, a: SrcAddress): string {
  const key = [customerId, normalizeAddress(a.street), normalizeAddress(a.street_line_2), normalizeAddress(a.city)].join("|");
  return `adr_${createHash("sha1").update(key).digest("hex").slice(0, 32)}`;
}

const OFFICE_SIGNALS =
  /\b(customer|cust|tenant|owner|homeowner|property manager|pm|hoa|caller|called|calling|call back|callback|left (a )?(vm|voicemail|message)|voicemail|spoke (with|to)|states?|stated|says|said|reports?|requesting|requested|wants|would like|needs? (an? )?(estimate|quote|service|maintenance|tune|repair|diagnos)|schedule[ds]?|booked|booking|book|confirm(ed)?|reschedul|appointment|appt|estimate sent|quote sent|invoice sent|payment|paid|deposit|card on file|door code|gate code|lockbox|access|please|follow[- ]?up|f\/u|per (the )?(customer|tech|office)|approved|approval|warranty (claim|registration)|registration|membership|pipeline|campaign)\b/i;
const TECH_SIGNALS =
  /\b(arrived|upon arrival|on arrival|found|checked|inspected|tested|replaced|installed|repaired|cleaned|flushed|cleared|recharged|charged|added|removed|tightened|rewired|wired|measured|verified|cycled|recommend(ed)?|system (is|was)|unit (is|was)|left (the )?(system|unit)|running|operating|cooling|heating|psi|refrigerant|freon|r-?410a|r-?22|capacitor|contactor|compressor|condenser|evaporator|coil|blower|motor|amps?|amperage|volts?|voltage|breaker|fuse|thermostat|t-?stat|drain (line|pan)|float switch|filter|superheat|subcool(ing)?|delta t|temp split|split|supply|return|static|txv|leak (search|test)|nitrogen|vacuum|micron|brazed|defrost|reversing valve|heat strip|duct|ductwork|plenum|disconnect|whip|pad)\b/i;

/**
 * author_type heuristic (brief): office if it reads like booking / follow-up
 * text, tech if it describes findings or work; default office for the first
 * note, tech for later ones.
 */
export function classifyNote(content: string, seq: number): "office" | "tech" {
  const text = content ?? "";
  const office = (text.match(new RegExp(OFFICE_SIGNALS.source, "gi")) ?? []).length;
  const tech = (text.match(new RegExp(TECH_SIGNALS.source, "gi")) ?? []).length;
  if (office === tech) return seq === 0 ? "office" : "tech";
  // Findings language wins ties broken by strength; a booking note with one
  // stray part name should stay office and vice versa.
  return tech > office ? "tech" : "office";
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Chunked INSERT ... ON CONFLICT (target) DO UPDATE SET <every provided
 * column> = excluded.<column>. Only columns present on the row objects are
 * updated, so defaults (created_at, source, priority) are left alone.
 */
async function upsert<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: T["$inferInsert"][],
  target: PgColumn | PgColumn[],
  opts: { chunk?: number; doNothing?: boolean } = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const targets = Array.isArray(target) ? target : [target];
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const provided = new Set(Object.keys(rows[0] as object));
  const set: Record<string, SQL> = {};
  for (const [key, col] of Object.entries(columns)) {
    if (!provided.has(key) || targets.includes(col)) continue;
    set[key] = sql.raw(`excluded."${col.name}"`);
  }
  const size = opts.chunk ?? 400;
  let n = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const q = tx.insert(table).values(chunk as T["$inferInsert"][]);
    if (opts.doNothing || Object.keys(set).length === 0) {
      await q.onConflictDoNothing({ target: targets });
    } else {
      await q.onConflictDoUpdate({ target: targets, set });
    }
    n += chunk.length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export async function runImport(opts: { dataDir?: string; log?: (s: string) => void } = {}): Promise<ImportCounts> {
  const dir = opts.dataDir ?? DATA_DIR;
  const log = opts.log ?? (() => {});
  const t0 = Date.now();

  const [srcEmployees, srcCustomers, srcJobs, srcInvoices] = await Promise.all([
    readJsonl<SrcEmployee>(path.join(dir, "employees.jsonl")),
    readJsonl<SrcCustomer>(path.join(dir, "customers.jsonl")),
    readJsonl<SrcJob>(path.join(dir, "jobs.jsonl")),
    readJsonl<SrcInvoice>(path.join(dir, "invoices.jsonl")),
  ]);
  log(
    `read ${srcEmployees.length} employees, ${srcCustomers.length} customers, ${srcJobs.length} jobs, ${srcInvoices.length} invoices in ${Date.now() - t0} ms`,
  );

  // --- employees
  const employeeRows = srcEmployees.map((e) => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    role: e.role,
    jobs: e.jobs ?? 0,
    active: true,
  }));

  // --- customers (customers.jsonl is authoritative; jobs may reference a
  // customer that is missing from it, in which case we create a stub).
  const customerById = new Map<string, typeof customers.$inferInsert>();
  for (const c of srcCustomers) {
    customerById.set(c.id, {
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      company: c.company,
      kind: c.kind,
      displayName: displayNameFor(c, c.addresses?.find((a) => a.street)?.street),
      jobCount: c.job_count ?? 0,
      firstJob: date(c.first_job),
      lastJob: date(c.last_job),
      updatedAt: new Date(),
    });
  }
  for (const j of srcJobs) {
    if (!customerById.has(j.customer.id)) {
      customerById.set(j.customer.id, {
        id: j.customer.id,
        firstName: j.customer.first_name,
        lastName: j.customer.last_name,
        company: j.customer.company,
        kind: j.customer.kind,
        displayName: displayNameFor(j.customer, j.address?.street),
        jobCount: 0,
        updatedAt: new Date(),
      });
    }
  }

  // --- addresses, deduped by id. customers.addresses first (owner is
  // authoritative there), then any job address not seen yet. Source rows
  // without an id get a deterministic synthetic id so the job still points
  // at a findable address.
  const addressById = new Map<string, typeof addresses.$inferInsert>();
  const addAddress = (customerId: string, a: SrcAddress): string | null => {
    if (!a) return null;
    if (a.id && addressById.has(a.id)) return a.id;
    if (!a.street?.trim()) return null; // nothing to find it by
    const id = a.id ?? syntheticAddressId(customerId, a);
    if (addressById.has(id)) return id;
    const { houseNumber, streetName } = parseStreet(a.street);
    addressById.set(id, {
      id,
      customerId,
      street: a.street.trim(),
      unit: a.street_line_2?.trim() || null,
      city: a.city?.trim() || null,
      state: a.state?.trim() || null,
      zip: a.zip?.trim() || null,
      lat: a.latitude,
      lng: a.longitude,
      normalizedStreet: normalizeAddress(a.street),
      houseNumber,
      streetName,
      searchText: buildSearchText({ street: a.street, unit: a.street_line_2, city: a.city, zip: a.zip }),
    });
    return id;
  };
  for (const c of srcCustomers) for (const a of c.addresses ?? []) addAddress(c.id, a);
  const jobAddressId = new Map<string, string | null>();
  for (const j of srcJobs) jobAddressId.set(j.id, addAddress(j.customer.id, j.address));

  // --- jobs, assignments, notes
  const jobRows: (typeof jobs.$inferInsert)[] = [];
  const assignmentRows: (typeof jobAssignments.$inferInsert)[] = [];
  const noteRows: (typeof notes.$inferInsert)[] = [];
  const employeeIds = new Set(employeeRows.map((e) => e.id));
  for (const j of srcJobs) {
    jobRows.push({
      id: j.id,
      invoiceNumber: j.invoice_number,
      description: j.description,
      workStatus: workStatus(j.work_status),
      scheduledStart: date(j.schedule?.scheduled_start),
      scheduledEnd: date(j.schedule?.scheduled_end),
      arrivalWindow: j.schedule?.arrival_window ?? null,
      onMyWayAt: date(j.work_timestamps?.on_my_way_at),
      startedAt: date(j.work_timestamps?.started_at),
      completedAt: date(j.work_timestamps?.completed_at),
      tags: j.tags ?? [],
      leadSource: j.lead_source,
      totalAmount: cents(j.total_amount),
      outstandingBalance: cents(j.outstanding_balance),
      customerId: j.customer.id,
      addressId: jobAddressId.get(j.id) ?? null,
      source: "import",
      createdAt: date(j.created_at) ?? new Date(),
      updatedAt: date(j.updated_at) ?? new Date(),
      canceledAt: date(j.canceled_at),
    });
    const seen = new Set<string>();
    for (const e of j.assigned_employees ?? []) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (!employeeIds.has(e.id)) {
        // Keep referential integrity: unknown assignee becomes an inactive employee.
        employeeIds.add(e.id);
        employeeRows.push({ id: e.id, firstName: e.first_name, lastName: e.last_name, role: "field tech", jobs: 0, active: false });
      }
      assignmentRows.push({ jobId: j.id, employeeId: e.id });
    }
    // Notes carry no timestamp in the export; anchor them to the job so
    // ordering by created_at matches the original sequence.
    const first = date(j.created_at) ?? date(j.schedule?.scheduled_start) ?? new Date(0);
    const later = date(j.work_timestamps?.started_at) ?? date(j.schedule?.scheduled_start) ?? first;
    (j.notes ?? []).forEach((n, seq) => {
      const base = seq === 0 ? first : later;
      noteRows.push({
        id: n.id,
        jobId: j.id,
        content: n.content ?? "",
        authorType: classifyNote(n.content ?? "", seq),
        createdAt: new Date(base.getTime() + seq * 60_000),
        seq,
      });
    });
  }

  // --- invoices
  const jobIds = new Set(jobRows.map((j) => j.id));
  const invoiceRows: (typeof invoices.$inferInsert)[] = [];
  const itemRows: (typeof invoiceItems.$inferInsert)[] = [];
  for (const inv of srcInvoices) {
    if (!jobIds.has(inv.job_id)) continue; // orphan invoice; none in the current export
    invoiceRows.push({
      id: inv.id,
      jobId: inv.job_id,
      invoiceNumber: inv.invoice_number,
      status: inv.status,
      amount: cents(inv.amount),
      subtotal: cents(inv.subtotal),
      dueAmount: cents(inv.due_amount),
      paidAt: date(inv.paid_at),
      sentAt: date(inv.sent_at),
      serviceDate: date(inv.service_date),
      invoiceDate: date(inv.invoice_date),
    });
    (inv.items ?? []).forEach((it, seq) => {
      itemRows.push({
        id: it.id,
        invoiceId: inv.id,
        name: it.name ?? "",
        type: it.type,
        unitPrice: cents(it.unit_price),
        qtyInHundredths: it.qty_in_hundredths ?? 100,
        amount: cents(it.amount),
        seq,
      });
    });
  }

  const customerRows = [...customerById.values()];
  const addressRows = [...addressById.values()];

  // --- write, one transaction
  const counts = await db.transaction(async (tx) => {
    const c: ImportCounts = {
      employees: await upsert(tx, employees, employeeRows, employees.id),
      customers: await upsert(tx, customers, customerRows, customers.id),
      addresses: await upsert(tx, addresses, addressRows, addresses.id),
      jobs: await upsert(tx, jobs, jobRows, jobs.id, { chunk: 250 }),
      job_assignments: 0,
      notes: 0,
      invoices: 0,
      invoice_items: 0,
    };

    // Imported jobs that vanished from the export (cascades to their
    // assignments, notes, invoices). Platform-created jobs are untouched.
    // Lists travel as JSONB: drizzle's sql`` expands a JS array into a ROW
    // list, which Postgres caps at 1664 entries.
    const jobIdJson = JSON.stringify([...jobIds]);
    await tx.execute(sql`
      delete from ${jobs} j
      where j.source = 'import'
        and not exists (select 1 from jsonb_array_elements_text(${jobIdJson}::jsonb) t(id) where t.id = j.id)`);

    // Assignments: sync imported jobs to the file's crew.
    const assignmentJson = JSON.stringify(assignmentRows.map((a) => ({ job_id: a.jobId, employee_id: a.employeeId })));
    await tx.execute(sql`
      delete from ${jobAssignments} ja
      using ${jobs} j
      where j.id = ja.job_id and j.source = 'import'
        and not exists (
          select 1 from jsonb_to_recordset(${assignmentJson}::jsonb) as t(job_id text, employee_id text)
          where t.job_id = ja.job_id and t.employee_id = ja.employee_id
        )`);
    c.job_assignments = await upsert(tx, jobAssignments, assignmentRows, [jobAssignments.jobId, jobAssignments.employeeId], {
      doNothing: true,
      chunk: 1000,
    });

    // Notes: upsert by id; drop imported (tech/office) notes on imported jobs
    // that are no longer in the file. Agent/system notes are kept.
    const noteIdJson = JSON.stringify(noteRows.map((n) => n.id));
    await tx.execute(sql`
      delete from ${notes} n
      using ${jobs} j
      where j.id = n.job_id and j.source = 'import'
        and n.author_type in ('tech', 'office')
        and not exists (select 1 from jsonb_array_elements_text(${noteIdJson}::jsonb) t(id) where t.id = n.id)`);
    c.notes = await upsert(tx, notes, noteRows, notes.id, { chunk: 500 });

    c.invoices = await upsert(tx, invoices, invoiceRows, invoices.id);
    c.invoice_items = await upsert(tx, invoiceItems, itemRows, invoiceItems.id, { chunk: 800 });
    return c;
  });

  await emitEvent({
    actor: "system",
    actorId: "import",
    type: "system.import",
    entityType: "system",
    entityId: null,
    payload: {
      actor_label: "import",
      summary: `Imported ${counts.jobs} jobs, ${counts.notes} notes, ${counts.invoices} invoices, ${counts.customers} customers, ${counts.employees} employees.`,
      counts: {
        jobs: counts.jobs,
        notes: counts.notes,
        invoices: counts.invoices,
        customers: counts.customers,
        employees: counts.employees,
        addresses: counts.addresses,
        job_assignments: counts.job_assignments,
        invoice_items: counts.invoice_items,
      },
      duration_ms: Date.now() - t0,
    },
  });
  log(`imported in ${Date.now() - t0} ms`);
  return counts;
}

/** Row counts as stored, for the idempotency check. */
export async function tableCounts(): Promise<ImportCounts> {
  const [r] = await pg<
    {
      employees: string;
      customers: string;
      addresses: string;
      jobs: string;
      job_assignments: string;
      notes: string;
      invoices: string;
      invoice_items: string;
    }[]
  >`
    select
      (select count(*) from employees) as employees,
      (select count(*) from customers) as customers,
      (select count(*) from addresses) as addresses,
      (select count(*) from jobs where source = 'import') as jobs,
      (select count(*) from job_assignments) as job_assignments,
      (select count(*) from notes where author_type in ('tech','office')) as notes,
      (select count(*) from invoices) as invoices,
      (select count(*) from invoice_items) as invoice_items`;
  const n = (s: string) => Number.parseInt(s, 10);
  return {
    employees: n(r.employees),
    customers: n(r.customers),
    addresses: n(r.addresses),
    jobs: n(r.jobs),
    job_assignments: n(r.job_assignments),
    notes: n(r.notes),
    invoices: n(r.invoices),
    invoice_items: n(r.invoice_items),
  };
}

async function main() {
  await readFile(path.join(DATA_DIR, "jobs.jsonl")).catch(() => {
    throw new Error(`data not found at ${DATA_DIR}; run from the repo root`);
  });
  const counts = await runImport({ log: (s) => console.log(`[import] ${s}`) });
  const stored = await tableCounts();
  console.log("[import] upserted:", counts);
  console.log("[import] in database:", stored);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then(() => pg.end())
    .catch(async (e) => {
      console.error(e);
      await pg.end();
      process.exit(1);
    });
}
