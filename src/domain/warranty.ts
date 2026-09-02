/**
 * Warranty derivation and equipment extraction (W1-C). Rules from
 * docs/TOOLS.md `check_warranty` and PLAN.md §4; every conclusion carries an
 * `evidence[]` list so the agent (and the office) can see why.
 */
import type { InvoiceItem, Note } from "@/db/schema";
import {
  DAY_MS,
  addressLabel,
  firstSentence,
  loadAddressBundle,
  numberWord,
  redact,
  spokenDate,
  visitDate,
  isVisit,
  type AddressBundle,
  type InvoiceWithItems,
  type JobWithTechs,
} from "@/domain/history";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * HVAC system installs only. A bare /install/i would also catch the
 * "Repairs & Part Installation" price-book prefix on ~700 repairs and the
 * plumbing installs (hose bibbs, toilets), so the pattern is deliberately
 * narrower than the brief's shorthand (noted in docs/TOOLS.md changelog).
 */
export const INSTALL_RE =
  /system installation|new system|system relocation|air handler installation|zone system|\b(?:ac|a\/c|hvac|heat pump|condenser|air handler|mini split)\s+install/i;

/** Equipment material lines (brands and unit types). */
export const EQUIPMENT_RE =
  /\b(Trane|Goodman|Carrier|Rheem|Daikin|Lennox|Heat Pump|Air Handler|Condenser|Fan Coil|Package unit|Mini Split|Furnace)\b/i;
/** Things that mention equipment words but are not equipment. */
const EQUIPMENT_EXCLUDE_RE =
  /^(WARRANTY|Unit Specific Parts|Service Calls|MISC Labor|Generic Parts|Diagnostic)|\b((fan|blower|condenser) motor|stand|capacitor|contactor|labor only|pad|float|switch|cleaning|coil clean|insulate|fee)\b/i;
const BRAND_RE = /\b(Trane|Goodman|Carrier|Rheem|Daikin|Lennox)\b/i;

export const WARRANTY_TAGS = [
  "1 Yr Labor Warranty",
  "Warranty Claim",
  "Warranty Complete",
  "Registration Needed",
  "Registration Complete",
  "Install callback (service related)",
  "Install callback (Part Failure)",
];
const WARRANTY_TAG_RE = /^(1 yr labor warranty|warranty claim|warranty complete|registration needed|registration complete|install callback)/i;
const WARRANTY_ITEM_RE = /^WARRANTY\b|\bWARRANTY\s*-/i;

export function isEquipmentLine(item: Pick<InvoiceItem, "name" | "type">): boolean {
  if (item.type && item.type !== "material") return false;
  return EQUIPMENT_RE.test(item.name) && !EQUIPMENT_EXCLUDE_RE.test(item.name);
}

export function isInstallFamily(job: Pick<JobWithTechs, "description">, items: InvoiceItem[]): boolean {
  if (job.description && INSTALL_RE.test(job.description)) return true;
  return items.some((it) => INSTALL_RE.test(it.name) || isEquipmentLine(it));
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export type Equipment = {
  kind: string;
  brand?: string;
  model?: string;
  tonnage?: number;
  seer?: number;
  installed_at?: string;
  source_job_id: string;
  line: string;
};

function equipmentKind(name: string): string {
  if (/fan coil|air handler/i.test(name)) return "air handler";
  if (/package unit/i.test(name)) return "package unit";
  if (/mini split/i.test(name)) return "mini split";
  const base = /heat pump/i.test(name) ? "heat pump" : /furnace|gas system/i.test(name) ? "gas furnace" : "system";
  if (/condenser/i.test(name)) return `${base} condenser`;
  if (/system/i.test(name)) return base === "system" ? "system" : `${base} system`;
  return base;
}

export function parseEquipmentLine(name: string): Omit<Equipment, "source_job_id" | "installed_at" | "line"> {
  const brand = BRAND_RE.exec(name)?.[1];
  const ton = /(\d+(?:\.\d+)?)\s*-?\s*Ton\b/i.exec(name);
  const seerParen = /\((\d+(?:\.\d+)?)\s*SEER\)/i.exec(name);
  const seerPlain = /(\d+(?:\.\d+)?)\s*SEER(?!\s*2|2)/i.exec(name);
  const seer2 = /(\d+(?:\.\d+)?)\s*SEER2/i.exec(name);
  const seerRaw = seerParen?.[1] ?? seerPlain?.[1] ?? seer2?.[1];
  const model = /\b([A-Z]{2,}\d[A-Z0-9-]{3,})\b/.exec(name)?.[1];
  return {
    kind: equipmentKind(name),
    brand: brand ? brand[0].toUpperCase() + brand.slice(1).toLowerCase() : undefined,
    model,
    tonnage: ton ? Number(ton[1]) : undefined,
    seer: seerRaw ? Number(seerRaw) : undefined,
  };
}

/** Equipment lines across every invoice at the address, deduped per job. */
export function extractEquipment(bundle: Pick<AddressBundle, "jobs" | "invoices">): Equipment[] {
  const out: Equipment[] = [];
  const seen = new Set<string>();
  const jobById = new Map(bundle.jobs.map((j) => [j.id, j]));
  for (const inv of bundle.invoices) {
    const job = jobById.get(inv.jobId);
    if (!job) continue;
    const lines = inv.items.filter(isEquipmentLine);
    const invoiceBrand = lines.map((l) => BRAND_RE.exec(l.name)?.[1]).find(Boolean);
    for (const it of lines) {
      const parsed = parseEquipmentLine(it.name);
      const brand = parsed.brand ?? (invoiceBrand ? invoiceBrand[0].toUpperCase() + invoiceBrand.slice(1).toLowerCase() : undefined);
      const key = `${job.id}|${parsed.kind}|${brand ?? ""}|${parsed.tonnage ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = visitDate(job);
      out.push({ ...parsed, brand, installed_at: at ? at.toISOString() : undefined, source_job_id: job.id, line: it.name });
    }
  }
  return out.sort((a, b) => (b.installed_at ?? "").localeCompare(a.installed_at ?? ""));
}

/** Short spoken form: "a Carrier 2.5 ton heat pump condenser". */
export function spokenEquipment(e: Equipment): string {
  const bits = [e.brand, e.tonnage ? `${e.tonnage} ton` : null, e.kind].filter(Boolean).join(" ");
  return `${/^[aeiou]/i.test(bits) ? "an" : "a"} ${bits}`;
}

// ---------------------------------------------------------------------------
// Warranty
// ---------------------------------------------------------------------------

export type WarrantyEvidence = { kind: "tag" | "install_job" | "invoice_item" | "note"; job_id: string; text: string };

export type Warranty = {
  status: "covered" | "partially_covered" | "expired" | "unknown";
  labor: { covered: boolean; until?: string; basis: string };
  parts: { covered: boolean | "likely"; until?: string; registered: boolean | "unknown"; basis: string };
  install_job_id?: string;
  installed_at?: string;
  evidence: WarrantyEvidence[];
  caveat: string;
  needs_office_confirmation: boolean;
};

const LABOR_DAYS = 365;
const PARTS_YEARS_UNREGISTERED = 5;
const PARTS_YEARS_REGISTERED = 10;
const NOTE_LOOKBACK_DAYS = 730;

function addYears(d: Date, years: number): Date {
  const out = new Date(d);
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

function invoicesFor(jobId: string, invoices: InvoiceWithItems[]): InvoiceItem[] {
  return invoices.filter((i) => i.jobId === jobId).flatMap((i) => i.items);
}

/** Pure derivation from an already-loaded bundle (the dossier reuses it). */
export function deriveWarranty(bundle: Pick<AddressBundle, "jobs" | "invoices" | "notesByJob">, now: Date = new Date()): Warranty {
  const evidence: WarrantyEvidence[] = [];
  const jobsByDate = [...bundle.jobs].sort((a, b) => (visitDate(b)?.getTime() ?? 0) - (visitDate(a)?.getTime() ?? 0));

  // Install jobs (completed / in progress only; a scheduled install is not a warranty yet).
  const installs = jobsByDate.filter((j) => isVisit(j.workStatus) && isInstallFamily(j, invoicesFor(j.id, bundle.invoices)));
  const install = installs[0];
  const installedAt = install ? visitDate(install) : null;
  for (const j of installs) {
    const d = visitDate(j);
    evidence.push({
      kind: "install_job",
      job_id: j.id,
      text: `${j.description?.trim() || "System installation"} on ${d ? spokenDate(d, { now }) : "an unknown date"} (job #${j.invoiceNumber ?? "?"})`,
    });
  }

  // Tags
  let registered: boolean | "unknown" = "unknown";
  const laborTagJobs: JobWithTechs[] = [];
  let claimEvidence = 0;
  for (const j of jobsByDate) {
    for (const t of j.tags) {
      if (!WARRANTY_TAG_RE.test(t)) continue;
      const d = visitDate(j);
      evidence.push({ kind: "tag", job_id: j.id, text: `Tag "${t}" on job #${j.invoiceNumber ?? "?"}${d ? ` (${spokenDate(d, { now })})` : ""}` });
      if (/^registration complete$/i.test(t)) registered = true;
      else if (/^registration needed$/i.test(t) && registered !== true) registered = false;
      if (/^1 yr labor warranty$/i.test(t) && d && now.getTime() - d.getTime() <= LABOR_DAYS * DAY_MS) laborTagJobs.push(j);
      if (/^(warranty claim|warranty complete)$/i.test(t)) claimEvidence++;
    }
  }

  // WARRANTY invoice lines
  for (const inv of bundle.invoices) {
    for (const it of inv.items) {
      if (WARRANTY_ITEM_RE.test(it.name)) {
        evidence.push({ kind: "invoice_item", job_id: inv.jobId, text: it.name });
        claimEvidence++;
      }
    }
  }

  // Notes mentioning warranty in the last 24 months
  for (const j of jobsByDate) {
    const d = visitDate(j);
    if (!d || now.getTime() - d.getTime() > NOTE_LOOKBACK_DAYS * DAY_MS) continue;
    for (const n of bundle.notesByJob.get(j.id) ?? ([] as Note[])) {
      if (!/warranty/i.test(n.content)) continue;
      const line = n.content.split(/\r?\n/).find((l) => /warranty/i.test(l)) ?? n.content;
      evidence.push({ kind: "note", job_id: j.id, text: firstSentence(redact(line), 140) });
    }
  }

  // Labor
  const laborByInstall = installedAt ? new Date(installedAt.getTime() + LABOR_DAYS * DAY_MS) : null;
  const laborTagDate = laborTagJobs.map((j) => visitDate(j)!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const laborByTag = laborTagDate ? new Date(laborTagDate.getTime() + LABOR_DAYS * DAY_MS) : null;
  let labor: Warranty["labor"];
  if (laborByInstall && laborByInstall.getTime() >= now.getTime()) {
    labor = {
      covered: true,
      until: laborByInstall.toISOString(),
      basis: `We installed the system on ${spokenDate(installedAt!, { now })} (job #${install!.invoiceNumber ?? "?"}); our labor warranty runs one year from install.`,
    };
  } else if (laborByTag && laborByTag.getTime() >= now.getTime()) {
    labor = {
      covered: true,
      until: laborByTag.toISOString(),
      basis: `Job #${laborTagJobs[0].invoiceNumber ?? "?"} on ${spokenDate(laborTagDate!, { now })} is tagged "1 Yr Labor Warranty".`,
    };
  } else if (installedAt) {
    labor = {
      covered: false,
      until: laborByInstall!.toISOString(),
      basis: `Our one-year labor warranty from the ${spokenDate(installedAt, { now })} install ended ${spokenDate(laborByInstall!, { now })}.`,
    };
  } else {
    labor = { covered: false, basis: "No installation by us on file for this address." };
  }

  // Parts
  let parts: Warranty["parts"];
  if (installedAt) {
    const years = registered === true ? PARTS_YEARS_REGISTERED : PARTS_YEARS_UNREGISTERED;
    const until = addYears(installedAt, years);
    const inWindow = until.getTime() >= now.getTime();
    parts = {
      covered: inWindow ? "likely" : false,
      until: until.toISOString(),
      registered,
      basis:
        registered === true
          ? `Registered with the manufacturer (tag "Registration Complete"); parts are typically covered ten years from the ${spokenDate(installedAt, { now })} install.`
          : registered === false
            ? `Registration was still needed on our records; unregistered parts coverage is typically five years from the ${spokenDate(installedAt, { now })} install.`
            : `No registration tag on file; parts are typically covered at least five years from the ${spokenDate(installedAt, { now })} install.`,
    };
  } else if (claimEvidence > 0) {
    parts = {
      covered: "likely",
      registered,
      basis: "We have handled manufacturer warranty parts at this address before, so the equipment is likely still under a parts warranty.",
    };
  } else {
    parts = { covered: false, registered, basis: "No installation or manufacturer warranty claim on file with us." };
  }

  const laborOk = labor.covered;
  const partsOk = parts.covered === true || parts.covered === "likely";
  const status: Warranty["status"] =
    laborOk && partsOk ? "covered" : laborOk || partsOk ? "partially_covered" : installedAt ? "expired" : "unknown";

  const needsOffice = status === "unknown" || !installedAt || registered !== true;
  const caveat =
    status === "unknown"
      ? "Nothing on file supports a warranty here; the office should confirm before we quote."
      : !installedAt
        ? "Coverage inferred from warranty claims, not from an install we did; the office should confirm the terms and the labor side."
        : registered === true
          ? "Labor is covered by us; parts are covered by the manufacturer subject to their terms. Diagnostic fees may still apply."
          : "Labor is covered by us; parts depend on manufacturer registration, which the office should confirm.";

  return {
    status,
    labor,
    parts,
    install_job_id: install?.id,
    installed_at: installedAt ? installedAt.toISOString() : undefined,
    evidence,
    caveat,
    needs_office_confirmation: needsOffice,
  };
}

export type WarrantyCheck = Warranty & {
  address_id: string;
  address_label: string;
  equipment: Equipment[];
};

export async function checkWarranty(addressId: string, now: Date = new Date()): Promise<WarrantyCheck | null> {
  const bundle = await loadAddressBundle(addressId);
  if (!bundle) return null;
  return {
    ...deriveWarranty(bundle, now),
    address_id: bundle.address.id,
    address_label: addressLabel(bundle.address),
    equipment: extractEquipment(bundle),
  };
}

/** One sentence: the answer and its basis, never over-promising. */
export function warrantySpeech(w: Warranty, equipment: Equipment[] = [], now: Date = new Date()): string {
  const installed = equipment.filter((e) => e.source_job_id === w.install_job_id);
  const systems = installed.filter((e) => !/air handler/.test(e.kind));
  const units = systems.length ? systems : installed;
  const what =
    units.length > 1
      ? `the ${numberWord(units.length)} systems we installed`
      : units[0]
        ? `the ${[units[0].brand, units[0].tonnage ? `${units[0].tonnage} ton` : null, units[0].kind].filter(Boolean).join(" ")} we installed`
        : "the system we installed";
  const laborUntil = w.labor.until ? spokenDate(w.labor.until, { now }) : null;
  const installedOn = w.installed_at ? spokenDate(w.installed_at, { now }) : null;
  switch (w.status) {
    case "covered":
      return w.parts.registered === true
        ? `Labor is covered until ${laborUntil} on ${what} ${installedOn}, and it's registered, so the manufacturer parts warranty should apply too.`
        : `Labor is covered until ${laborUntil} on ${what} ${installedOn}; parts are likely covered by the manufacturer, but I'd have the office confirm the registration.`;
    case "partially_covered":
      if (w.labor.covered) return `Labor is still covered until ${laborUntil}, but I don't have a parts warranty on file, so the office would need to confirm that side.`;
      return w.installed_at
        ? `Our one-year labor warranty from the ${installedOn} install has passed, but the manufacturer parts warranty likely still applies; I'll have the office confirm before we quote.`
        : `We've handled manufacturer warranty parts there before, so parts are likely still covered, but I'd have the office confirm coverage and the labor side.`;
    case "expired":
      return `${what[0].toUpperCase()}${what.slice(1)} ${installedOn} is past both the labor and parts windows on our records, so any repair would be billable.`;
    default:
      return "I don't see an installation or warranty on file for that address, so I'd have the office confirm coverage before we quote anything.";
  }
}
