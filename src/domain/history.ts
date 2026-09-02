/**
 * Knowledge read side (W1-C): visit history, job lookup, notes, balances,
 * the shared per-address bundle loader, and the small text / speech helpers
 * every knowledge tool uses. Deterministic, no LLM calls.
 */
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/db";
import {
  addresses,
  customers,
  employees,
  invoiceItems,
  invoices,
  jobAssignments,
  jobs,
  notes,
  type Address,
  type Customer,
  type Invoice,
  type InvoiceItem,
  type Job,
  type Note,
} from "@/db/schema";
import { formatAddressLabel } from "@/lib/address-normalize";
import { BUSINESS_TZ, isoDateET } from "@/lib/time";

// ---------------------------------------------------------------------------
// Shared types and constants
// ---------------------------------------------------------------------------

export type TechRef = { employee_id: string; name: string };
export type JobWithTechs = Job & { techs: TechRef[] };
export type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

/** Everything the knowledge tools need about one service address, loaded once. */
export type AddressBundle = {
  address: Address;
  customer: Customer;
  /** Every job at the address, most recent visit date first. */
  jobs: JobWithTechs[];
  notesByJob: Map<string, Note[]>;
  invoices: InvoiceWithItems[];
};

export const VISIT_STATUSES = ["complete rated", "complete unrated", "in progress"] as const;
export const CANCELED_STATUSES = ["user canceled", "pro canceled"] as const;
export const OPEN_STATUSES = ["scheduled", "in progress", "needs scheduling"] as const;

/** Office tags that mean "we had to come back" (PLAN.md §4: surface as open-issue context). */
export const CALLBACK_TAG_RE = /^(service callback|install callback|warranty claim)/i;

export const DAY_MS = 86_400_000;

/** The instant a job "happened": completion, else start, else the scheduled slot. */
export function visitDate(job: Pick<Job, "completedAt" | "startedAt" | "scheduledStart">): Date | null {
  return job.completedAt ?? job.startedAt ?? job.scheduledStart ?? null;
}

export function isCanceled(status: Job["workStatus"]): boolean {
  return (CANCELED_STATUSES as readonly string[]).includes(status);
}

export function isVisit(status: Job["workStatus"]): boolean {
  return (VISIT_STATUSES as readonly string[]).includes(status);
}

export function hasCallbackTag(tags: string[]): boolean {
  return tags.some((t) => CALLBACK_TAG_RE.test(t));
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "Door code: 1234", "gate code #4521", "lockbox 0987", "code is 5566"
const CODE_RE =
  /\b((?:(?:door|gate|garage|access|master|alarm|keypad|entry|unit|building)\s*)?(?:code|pin|passcode)|lock\s*box|lockbox)(\s*(?:is|:|#|-)?\s*#?\s*)([A-Za-z]?\d{3,8}[A-Za-z]?)\b/gi;

/**
 * Belt-and-braces redaction. The import already replaced codes/phones/emails
 * with [code]/[phone]/[email]; this catches anything that slipped through and
 * anything typed later by the office or the agent.
 */
export function redact(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(CODE_RE, (_m, prefix: string, sep: string) => `${prefix}${sep || " "}[code]`);
}

/** Trailing bookkeeping notes that say nothing about the visit. */
const HOUSEKEEPING_RE = /^(followed?\s*up|follow\s*up|sent\b.*\b(invoice|estimate)|updated?\s+in|(invoice|estimate)\s+sent)/i;
/** Header lines some techs start with ("Gerald's notes: 1 September 2026: SJ", "Past visits —"). */
const HEADER_LINE_RE = /^[\w' ]{0,24}notes?\s*:|^\d{1,2}\s+[a-z]+\s+\d{4}\b|^(past visits|prior jobs)/i;

/**
 * First sentence of a note, whitespace-collapsed, bullets and header lines
 * stripped, cut to `max` characters at a word boundary. Never returns a
 * multi-paragraph blob.
 */
export function firstSentence(text: string | null | undefined, max = 140): string {
  if (!text) return "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*\-•·]+/, "").trim())
    .filter((l) => l.length > 0);
  const line = lines.find((l) => !HEADER_LINE_RE.test(l)) ?? lines[0] ?? "";
  const m = /^(.*?[.!?])(?:\s|$)/.exec(line);
  let s = (m ? m[1] : line).replace(/\s+/g, " ").trim();
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    s = `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "")}…`;
  }
  return s;
}

/**
 * The one-line summary of a visit: the last substantive tech-authored note's
 * first sentence (skipping trailing housekeeping like "Followed up in HCP"),
 * else the job description, else a neutral label. Always redacted.
 */
export type NoteLike = { authorType: Note["authorType"]; content: string; seq: number };

/** The tech note worth quoting: the last substantive one, else the last tech note at all. */
export function pickTechNote<T extends NoteLike>(jobNotes: T[]): T | null {
  const tech = jobNotes.filter((n) => n.authorType === "tech").sort((a, b) => a.seq - b.seq);
  const substantive = [...tech].reverse().find((n) => n.content.trim().length >= 40 && !HOUSEKEEPING_RE.test(n.content.trim()));
  return substantive ?? tech[tech.length - 1] ?? null;
}

export function oneLine(jobNotes: NoteLike[], description: string | null | undefined, max = 140): string {
  const pick = pickTechNote(jobNotes);
  if (pick) {
    const s = firstSentence(redact(pick.content), max);
    if (s) return s;
  }
  const d = (description ?? "").trim();
  if (d) return firstSentence(redact(d), max);
  return "Service visit";
}

// ---------------------------------------------------------------------------
// Speech helpers (everything spoken is ET)
// ---------------------------------------------------------------------------

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

export function numberWord(n: number): string {
  return n >= 0 && n <= 20 && Number.isInteger(n) ? NUMBER_WORDS[n] : String(n);
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

export function joinSpoken(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "$208.93" / "$1,817" for whole dollars. */
export function dollars(cents: number): string {
  const d = cents / 100;
  const whole = Number.isInteger(d);
  return `$${d.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "July 27th", "Thursday September 3rd", "March 2nd, 2025" (year only when it differs from now). */
export function spokenDate(d: Date | string | number, opts: { weekday?: boolean; now?: Date } = {}): string {
  const date = new Date(d);
  const now = opts.now ?? new Date();
  const month = formatInTimeZone(date, BUSINESS_TZ, "MMMM");
  const day = Number(formatInTimeZone(date, BUSINESS_TZ, "d"));
  const year = formatInTimeZone(date, BUSINESS_TZ, "yyyy");
  const wd = opts.weekday ? `${formatInTimeZone(date, BUSINESS_TZ, "EEEE")} ` : "";
  const yr = year !== formatInTimeZone(now, BUSINESS_TZ, "yyyy") ? `, ${year}` : "";
  return `${wd}${month} ${ordinal(day)}${yr}`;
}

/** "10 AM", "2:30 PM", "noon", "midnight". */
export function spokenTime(d: Date | string | number): string {
  const date = new Date(d);
  const h = Number(formatInTimeZone(date, BUSINESS_TZ, "H"));
  const m = Number(formatInTimeZone(date, BUSINESS_TZ, "m"));
  if (h === 12 && m === 0) return "noon";
  if (h === 0 && m === 0) return "midnight";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mer = h < 12 ? "AM" : "PM";
  return m === 0 ? `${h12} ${mer}` : `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

/** "today" / "tomorrow" / "yesterday" / "Thursday September 3rd". */
export function spokenDay(d: Date | string | number, now: Date = new Date()): string {
  const target = isoDateET(d);
  const today = isoDateET(now);
  if (target === today) return "today";
  if (target === isoDateET(now.getTime() + DAY_MS)) return "tomorrow";
  if (target === isoDateET(now.getTime() - DAY_MS)) return "yesterday";
  return spokenDate(d, { weekday: true, now });
}

/** "Thursday September 3rd, 10 AM to noon" — the `*_label` shape from docs/TOOLS.md. */
export function spokenWindow(start: Date | string | number, end: Date | string | number | null, now: Date = new Date()): string {
  const s = new Date(start);
  if (!end) return `${spokenDate(s, { weekday: true, now })}, ${spokenTime(s)}`;
  const e = new Date(end);
  const sameDay = isoDateET(s) === isoDateET(e);
  if (sameDay) return `${spokenDate(s, { weekday: true, now })}, ${spokenTime(s)} to ${spokenTime(e)}`;
  return `${spokenDate(s, { weekday: true, now })}, ${spokenTime(s)} to ${spokenDate(e, { weekday: true, now })}, ${spokenTime(e)}`;
}

/** Arrival window end: scheduled_start + arrival_window minutes (default 120), else scheduled_end. */
export function windowEnd(job: Pick<Job, "scheduledStart" | "scheduledEnd" | "arrivalWindow">): Date | null {
  if (!job.scheduledStart) return job.scheduledEnd ?? null;
  const minutes = job.arrivalWindow && job.arrivalWindow > 0 ? job.arrivalWindow : null;
  if (minutes) return new Date(job.scheduledStart.getTime() + minutes * 60_000);
  return job.scheduledEnd ?? new Date(job.scheduledStart.getTime() + 120 * 60_000);
}

export function addressLabel(a: Pick<Address, "street" | "unit" | "city">): string {
  return formatAddressLabel({ street: a.street, unit: a.unit, city: a.city });
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export async function loadTechs(jobIds: string[]): Promise<Map<string, TechRef[]>> {
  const out = new Map<string, TechRef[]>();
  if (jobIds.length === 0) return out;
  const rows = await db
    .select({
      jobId: jobAssignments.jobId,
      employeeId: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
    })
    .from(jobAssignments)
    .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
    .where(inArray(jobAssignments.jobId, jobIds))
    .orderBy(employees.firstName, employees.lastName);
  for (const r of rows) {
    const list = out.get(r.jobId) ?? [];
    list.push({ employee_id: r.employeeId, name: `${r.firstName} ${r.lastName}`.trim() });
    out.set(r.jobId, list);
  }
  return out;
}

export async function loadNotes(jobIds: string[]): Promise<Map<string, Note[]>> {
  const out = new Map<string, Note[]>();
  if (jobIds.length === 0) return out;
  const rows = await db.select().from(notes).where(inArray(notes.jobId, jobIds)).orderBy(notes.jobId, notes.seq, notes.createdAt);
  for (const n of rows) {
    const list = out.get(n.jobId) ?? [];
    list.push(n);
    out.set(n.jobId, list);
  }
  return out;
}

export async function loadInvoices(jobIds: string[]): Promise<InvoiceWithItems[]> {
  if (jobIds.length === 0) return [];
  const invs = await db.select().from(invoices).where(inArray(invoices.jobId, jobIds));
  if (invs.length === 0) return [];
  const items = await db
    .select()
    .from(invoiceItems)
    .where(inArray(invoiceItems.invoiceId, invs.map((i) => i.id)))
    .orderBy(invoiceItems.invoiceId, invoiceItems.seq);
  const byInvoice = new Map<string, InvoiceItem[]>();
  for (const it of items) {
    const list = byInvoice.get(it.invoiceId) ?? [];
    list.push(it);
    byInvoice.set(it.invoiceId, list);
  }
  return invs.map((i) => ({ ...i, items: byInvoice.get(i.id) ?? [] }));
}

function byVisitDesc(a: Job, b: Job): number {
  return (visitDate(b)?.getTime() ?? 0) - (visitDate(a)?.getTime() ?? 0);
}

/** One round of parallel queries; null when the address does not exist. */
export async function loadAddressBundle(addressId: string): Promise<AddressBundle | null> {
  const [addrRows, jobRows] = await Promise.all([
    db
      .select({ address: addresses, customer: customers })
      .from(addresses)
      .innerJoin(customers, eq(customers.id, addresses.customerId))
      .where(eq(addresses.id, addressId))
      .limit(1),
    db.select().from(jobs).where(eq(jobs.addressId, addressId)),
  ]);
  const head = addrRows[0];
  if (!head) return null;
  const ids = jobRows.map((j) => j.id);
  const [techs, notesByJob, invs] = await Promise.all([loadTechs(ids), loadNotes(ids), loadInvoices(ids)]);
  const withTechs: JobWithTechs[] = jobRows.map((j) => ({ ...j, techs: techs.get(j.id) ?? [] })).sort(byVisitDesc);
  return { address: head.address, customer: head.customer, jobs: withTechs, notesByJob, invoices: invs };
}

// ---------------------------------------------------------------------------
// get_visit_history
// ---------------------------------------------------------------------------

export type Visit = {
  job_id: string;
  invoice_number: string | null;
  date: string | null;
  status: Job["workStatus"];
  description: string | null;
  tech_names: string[];
  one_line: string;
  total_cents: number;
  outstanding_cents: number;
  tags: string[];
};

export type VisitHistoryOptions = {
  addressId?: string | null;
  customerId?: string | null;
  limit?: number;
  before?: Date | string | null;
};

export type VisitHistory = {
  visits: Visit[];
  /** the address label when the lookup was by address (for speech) */
  address_label: string | null;
  customer_name: string | null;
};

const visitDateSql = sql<Date>`coalesce(${jobs.completedAt}, ${jobs.startedAt}, ${jobs.scheduledStart})`;

export async function getVisitHistory(opts: VisitHistoryOptions): Promise<VisitHistory> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 25);
  const scope = [
    opts.addressId ? eq(jobs.addressId, opts.addressId) : undefined,
    opts.customerId ? eq(jobs.customerId, opts.customerId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (scope.length === 0) return { visits: [], address_label: null, customer_name: null };

  const where = and(
    scope.length === 2 ? or(...scope) : scope[0],
    inArray(jobs.workStatus, [...VISIT_STATUSES]),
    opts.before ? sql`${visitDateSql} < ${new Date(opts.before).toISOString()}::timestamptz` : undefined,
  );

  const [rows, addr, cust] = await Promise.all([
    db.select().from(jobs).where(where).orderBy(desc(visitDateSql)).limit(limit),
    opts.addressId
      ? db.select({ street: addresses.street, unit: addresses.unit, city: addresses.city }).from(addresses).where(eq(addresses.id, opts.addressId)).limit(1)
      : Promise.resolve([]),
    opts.customerId
      ? db.select({ name: customers.displayName }).from(customers).where(eq(customers.id, opts.customerId)).limit(1)
      : Promise.resolve([]),
  ]);
  const ids = rows.map((r) => r.id);
  const [techs, noteMap] = await Promise.all([loadTechs(ids), loadNotes(ids)]);

  return {
    visits: rows.map((j) => ({
      job_id: j.id,
      invoice_number: j.invoiceNumber,
      date: iso(visitDate(j)),
      status: j.workStatus,
      description: j.description,
      tech_names: (techs.get(j.id) ?? []).map((t) => t.name),
      one_line: oneLine(noteMap.get(j.id) ?? [], j.description),
      total_cents: j.totalAmount,
      outstanding_cents: j.outstandingBalance,
      tags: j.tags,
    })),
    address_label: addr[0] ? addressLabel(addr[0]) : null,
    customer_name: cust[0]?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// get_job
// ---------------------------------------------------------------------------

export type JobDetail = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  work_status: Job["workStatus"];
  priority: Job["priority"];
  window_start: string | null;
  window_end: string | null;
  window_label: string | null;
  arrival_window_min: number | null;
  tech: TechRef[];
  customer: { customer_id: string; display_name: string; kind: string | null };
  address_id: string | null;
  address_label: string | null;
  total_cents: number;
  outstanding_cents: number;
  tags: string[];
  notes_count: number;
  last_note_one_line: string;
  source: Job["source"];
  visit_date: string | null;
};

export async function getJob(
  lookup: { jobId?: string | null; invoiceNumber?: string | null },
  now: Date = new Date(),
): Promise<JobDetail | null> {
  const cond = lookup.jobId
    ? eq(jobs.id, lookup.jobId)
    : lookup.invoiceNumber
      ? eq(jobs.invoiceNumber, lookup.invoiceNumber.trim())
      : null;
  if (!cond) return null;
  const rows = await db
    .select({ job: jobs, customer: customers, address: addresses })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .where(cond)
    .orderBy(desc(visitDateSql))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const [techs, noteMap] = await Promise.all([loadTechs([r.job.id]), loadNotes([r.job.id])]);
  const jobNotes = noteMap.get(r.job.id) ?? [];
  const wEnd = windowEnd(r.job);
  return {
    job_id: r.job.id,
    invoice_number: r.job.invoiceNumber,
    description: r.job.description,
    work_status: r.job.workStatus,
    priority: r.job.priority,
    window_start: iso(r.job.scheduledStart),
    window_end: iso(wEnd),
    window_label: r.job.scheduledStart ? spokenWindow(r.job.scheduledStart, wEnd, now) : null,
    arrival_window_min: r.job.arrivalWindow,
    tech: techs.get(r.job.id) ?? [],
    customer: { customer_id: r.customer.id, display_name: r.customer.displayName, kind: r.customer.kind },
    address_id: r.address?.id ?? null,
    address_label: r.address ? addressLabel(r.address) : null,
    total_cents: r.job.totalAmount,
    outstanding_cents: r.job.outstandingBalance,
    tags: r.job.tags,
    notes_count: jobNotes.length,
    last_note_one_line: oneLine(jobNotes, r.job.description),
    source: r.job.source,
    visit_date: iso(visitDate(r.job)),
  };
}

// ---------------------------------------------------------------------------
// get_job_notes
// ---------------------------------------------------------------------------

export type JobNotes = {
  job_id: string;
  invoice_number: string | null;
  description: string | null;
  notes: { seq: number; author_type: Note["authorType"]; created_at: string; content_redacted: string }[];
};

export async function getJobNotes(jobId: string): Promise<JobNotes | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return null;
  const noteMap = await loadNotes([job.id]);
  return {
    job_id: job.id,
    invoice_number: job.invoiceNumber,
    description: job.description,
    notes: (noteMap.get(job.id) ?? []).map((n) => ({
      seq: n.seq,
      author_type: n.authorType,
      created_at: n.createdAt.toISOString(),
      content_redacted: redact(n.content),
    })),
  };
}

// ---------------------------------------------------------------------------
// get_open_balance
// ---------------------------------------------------------------------------

export type OpenBalance = {
  customer_id: string;
  customer_name: string;
  total_cents: number;
  invoices: {
    invoice_number: string | null;
    job_id: string;
    due_cents: number;
    service_date: string | null;
    /** the job's work status; `invoice_status` is the billing row when one exists */
    status: Job["workStatus"];
    invoice_status: string | null;
    address_label: string | null;
  }[];
};

/**
 * Source of truth is `jobs.outstanding_balance` (the export's per-job balance);
 * the invoices table lags it (some "paid" rows still carry a job balance), so
 * its status is reported alongside rather than used to filter.
 */
export async function getOpenBalance(customerId: string): Promise<OpenBalance | null> {
  const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!cust) return null;
  const rows = await db
    .select({ job: jobs, address: addresses, invoiceStatus: invoices.status })
    .from(jobs)
    .leftJoin(addresses, eq(addresses.id, jobs.addressId))
    .leftJoin(invoices, and(eq(invoices.jobId, jobs.id), eq(invoices.invoiceNumber, jobs.invoiceNumber)))
    .where(and(eq(jobs.customerId, customerId), gt(jobs.outstandingBalance, 0)))
    .orderBy(visitDateSql);
  const seen = new Set<string>();
  const list = rows
    .filter((r) => (seen.has(r.job.id) ? false : (seen.add(r.job.id), true)))
    .map((r) => ({
      invoice_number: r.job.invoiceNumber,
      job_id: r.job.id,
      due_cents: r.job.outstandingBalance,
      service_date: iso(visitDate(r.job)),
      status: r.job.workStatus,
      invoice_status: r.invoiceStatus ?? null,
      address_label: r.address ? addressLabel(r.address) : null,
    }));
  return {
    customer_id: cust.id,
    customer_name: cust.displayName,
    total_cents: list.reduce((s, i) => s + i.due_cents, 0),
    invoices: list,
  };
}
