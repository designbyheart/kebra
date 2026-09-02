/**
 * Deterministic address dossier (W1-C). Builds the `get_address_dossier`
 * result shape straight from jobs / notes / invoices so the tool always has
 * fresh structured facts; W1-D's LLM `summary_md` is layered on top by the
 * tool when a precomputed row exists.
 */
import type { Note } from "@/db/schema";
import {
  CALLBACK_TAG_RE,
  DAY_MS,
  addressLabel,
  firstSentence,
  isVisit,
  loadAddressBundle,
  oneLine,
  redact,
  spokenDate,
  spokenWindow,
  visitDate,
  windowEnd,
  type AddressBundle,
  type JobWithTechs,
} from "@/domain/history";
import { deriveWarranty, extractEquipment, isEquipmentLine, type Equipment, type Warranty } from "@/domain/warranty";

export type LastVisit = {
  job_id: string;
  invoice_number: string | null;
  date: string;
  tech_names: string[];
  summary: string;
  description: string | null;
  status: JobWithTechs["workStatus"];
  /** price-book families billed on that visit, e.g. ["Clear Drain Line", "Replace safety switch"] */
  work_items: string[];
  outstanding_cents: number;
};

export type OpenIssue = { text: string; job_id: string; date: string | null; kind: "callback" | "needs_scheduling" | "pending_cancellation" };
export type UpcomingJob = { job_id: string; invoice_number: string | null; window_start: string; window_end: string | null; window_label: string; tech_names: string[]; description: string | null; status: JobWithTechs["workStatus"] };

export type AddressDossier = {
  address_id: string;
  address_label: string;
  street: string;
  unit: string | null;
  city: string | null;
  customer: { customer_id: string; display_name: string; kind: string | null };
  last_visit: LastVisit | null;
  visit_count_12m: number;
  equipment: Equipment[];
  open_issues: string[];
  open_issue_details: OpenIssue[];
  recurring_issues: string[];
  warranty: Warranty;
  open_balance_cents: number;
  open_balance_jobs: number;
  upcoming: UpcomingJob[];
  access_notes: { text: string; sensitive: true } | null;
  summary_md: string | null;
  /** where the structured fields came from */
  source: "fallback";
};

// "garage" alone also matches "shower leaking in the garage", so it needs a door/code word next to it.
const ACCESS_RE = /door\s*code|gate\s*code|lock\s*box|lockbox|garage\s*(code|door|opener|remote|key)|master\s*code|key\s*pad|access\s*code|alarm\s*code/i;
const FEE_FAMILY_RE =
  /dispatch|repair fee|^standard$|^after-hours$|^service$|^labor$|maintenance|^visit #|^pm\b|refrigerant|r410a|weekend|delivery|free with|guarantee|^tier \d+ repair$|financing|deposit|discount|^system installation$|installation$/i;

/** "Service Calls - Repairs & Part Installation - **Tier 3 Repair - Clear Drain Line" -> "Clear Drain Line". */
export function itemFamily(name: string): string {
  const segs = name
    .split(/\s+-\s+/)
    .map((s) => s.replace(/\*+/g, "").trim())
    .filter(Boolean);
  const last = segs[segs.length - 1] ?? name.trim();
  return last.replace(/\s+/g, " ");
}

export function isWorkFamily(family: string): boolean {
  return !FEE_FAMILY_RE.test(family);
}

function callbackLabel(tags: string[]): string | null {
  const t = tags.find((x) => CALLBACK_TAG_RE.test(x));
  if (!t) return null;
  if (/^service callback/i.test(t)) return "Service callback";
  if (/^install callback/i.test(t)) return "Install callback";
  if (/^warranty claim/i.test(t)) return "Warranty claim";
  return t;
}

function accessLines(jobNotes: Note[]): string[] {
  const out: string[] = [];
  for (const n of [...jobNotes].sort((a, b) => b.seq - a.seq)) {
    if (!ACCESS_RE.test(n.content)) continue;
    for (const raw of n.content.split(/\r?\n/)) {
      const line = raw.trim();
      if (line && ACCESS_RE.test(line)) out.push(firstSentence(redact(line), 120));
    }
  }
  return out;
}

export function buildDossierFromBundle(bundle: AddressBundle, now: Date = new Date()): AddressDossier {
  const yearAgo = now.getTime() - 365 * DAY_MS;
  const visits = bundle.jobs.filter((j) => isVisit(j.workStatus) && visitDate(j));
  const last = visits[0] ?? null;

  let last_visit: LastVisit | null = null;
  if (last) {
    const items = bundle.invoices.filter((i) => i.jobId === last.id).flatMap((i) => i.items);
    const families = [...new Set(items.map((it) => itemFamily(it.name)).filter(isWorkFamily))];
    last_visit = {
      job_id: last.id,
      invoice_number: last.invoiceNumber,
      date: visitDate(last)!.toISOString(),
      tech_names: last.techs.map((t) => t.name),
      summary: oneLine(bundle.notesByJob.get(last.id) ?? [], last.description),
      description: last.description,
      status: last.workStatus,
      work_items: families,
      outstanding_cents: last.outstandingBalance,
    };
  }

  // Open issues: callback-tagged jobs and anything waiting on us, last 12 months.
  const open_issue_details: OpenIssue[] = [];
  for (const j of bundle.jobs) {
    const d = visitDate(j);
    const stamp = d ? d.toISOString() : null;
    const when = d && d.getTime() <= now.getTime() ? ` on ${spokenDate(d, { now })}` : "";
    const label = callbackLabel(j.tags);
    if (label && d && d.getTime() >= yearAgo) {
      open_issue_details.push({
        kind: "callback",
        job_id: j.id,
        date: stamp,
        text: `${label}${when} (job #${j.invoiceNumber ?? "?"}): ${oneLine(bundle.notesByJob.get(j.id) ?? [], j.description, 120)}`,
      });
    } else if (j.workStatus === "needs scheduling") {
      open_issue_details.push({
        kind: "needs_scheduling",
        job_id: j.id,
        date: stamp,
        text: `Needs scheduling (job #${j.invoiceNumber ?? "?"}): ${oneLine(bundle.notesByJob.get(j.id) ?? [], j.description, 120)}`,
      });
    } else if (j.workStatus === "pending_cancellation") {
      open_issue_details.push({ kind: "pending_cancellation", job_id: j.id, date: stamp, text: `Cancellation pending office approval (job #${j.invoiceNumber ?? "?"}).` });
    }
  }
  open_issue_details.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // Recurring: a labor (work) family billed on 2+ distinct visits in 12 months.
  // Counting distinct jobs (not lines) keeps duplicate invoices on one job and
  // material lines ("15 SEER") from inventing a pattern.
  const familyHits = new Map<string, { jobs: Set<string>; first: Date; last: Date }>();
  for (const inv of bundle.invoices) {
    const job = bundle.jobs.find((j) => j.id === inv.jobId);
    const d = job ? visitDate(job) : null;
    if (!job || !d || d.getTime() < yearAgo || !isVisit(job.workStatus)) continue;
    for (const it of inv.items) {
      if (it.type && it.type !== "labor") continue;
      if (isEquipmentLine(it)) continue;
      const fam = itemFamily(it.name);
      if (!isWorkFamily(fam)) continue;
      const cur = familyHits.get(fam) ?? { jobs: new Set<string>(), first: d, last: d };
      cur.jobs.add(job.id);
      if (d < cur.first) cur.first = d;
      if (d > cur.last) cur.last = d;
      familyHits.set(fam, cur);
    }
  }
  const recurring_issues = [...familyHits.entries()]
    .filter(([, v]) => v.jobs.size >= 2)
    .sort((a, b) => b[1].jobs.size - a[1].jobs.size)
    .map(([fam, v]) => `${fam} (${v.jobs.size} visits since ${spokenDate(v.first, { now })})`);

  // Access notes: latest lines that mention a door/gate/lockbox, code already redacted.
  const access: string[] = [];
  for (const j of bundle.jobs) {
    for (const line of accessLines(bundle.notesByJob.get(j.id) ?? [])) {
      const key = line.toLowerCase();
      if (!access.some((a) => a.toLowerCase() === key)) access.push(line);
      if (access.length >= 3) break;
    }
    if (access.length >= 3) break;
  }

  // Upcoming
  const upcoming: UpcomingJob[] = bundle.jobs
    .filter((j) => j.scheduledStart && j.scheduledStart.getTime() >= now.getTime() && ["scheduled", "needs scheduling", "in progress"].includes(j.workStatus))
    .sort((a, b) => a.scheduledStart!.getTime() - b.scheduledStart!.getTime())
    .slice(0, 3)
    .map((j) => {
      const end = windowEnd(j);
      return {
        job_id: j.id,
        invoice_number: j.invoiceNumber,
        window_start: j.scheduledStart!.toISOString(),
        window_end: end ? end.toISOString() : null,
        window_label: spokenWindow(j.scheduledStart!, end, now),
        tech_names: j.techs.map((t) => t.name),
        description: j.description,
        status: j.workStatus,
      };
    });

  const balanceJobs = bundle.jobs.filter((j) => j.outstandingBalance > 0 && !upcoming.some((u) => u.job_id === j.id));

  return {
    address_id: bundle.address.id,
    address_label: addressLabel(bundle.address),
    street: bundle.address.street,
    unit: bundle.address.unit,
    city: bundle.address.city,
    customer: { customer_id: bundle.customer.id, display_name: bundle.customer.displayName, kind: bundle.customer.kind },
    last_visit,
    visit_count_12m: visits.filter((j) => visitDate(j)!.getTime() >= yearAgo).length,
    equipment: extractEquipment(bundle),
    open_issues: open_issue_details.map((o) => o.text),
    open_issue_details,
    recurring_issues,
    warranty: deriveWarranty(bundle, now),
    open_balance_cents: balanceJobs.reduce((s, j) => s + j.outstandingBalance, 0),
    open_balance_jobs: balanceJobs.length,
    upcoming,
    access_notes: access.length ? { text: access.join("; "), sensitive: true } : null,
    summary_md: null,
    source: "fallback",
  };
}

/** Null when the address does not exist. */
export async function buildDossierFallback(addressId: string, now: Date = new Date()): Promise<AddressDossier | null> {
  const bundle = await loadAddressBundle(addressId);
  if (!bundle) return null;
  return buildDossierFromBundle(bundle, now);
}
