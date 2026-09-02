/**
 * URL query → typed job-list filters (pure; unit tested). Shared by the /jobs
 * page and its filter form so both agree on defaults.
 */
import { WORK_STATUSES, type WorkStatus } from "@/lib/job-constants";

export const OPEN_PRESET: WorkStatus[] = ["scheduled", "in progress", "needs scheduling", "pending_cancellation"];
export const JOB_SOURCES = ["import", "agent", "office"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export type JobFilters = {
  /** null = any status */
  statuses: WorkStatus[] | null;
  /** the raw status selection for the form ("open" preset or a status or "") */
  statusParam: string;
  tech: string | null;
  from: string | null; // YYYY-MM-DD (ET)
  to: string | null; // YYYY-MM-DD (ET), inclusive
  tag: string | null;
  source: JobSource | null;
  q: string | null;
  /** true when the date range came from defaults rather than the URL */
  defaultRange: boolean;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : null;
}

/** ISO date string shifted by `days` (calendar arithmetic on the yyyy-mm-dd, no TZ involved). */
export function shiftIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function parseJobFilters(sp: RawSearchParams, todayIso: string): JobFilters {
  const statusParam = one(sp.status) ?? "";
  let statuses: WorkStatus[] | null = null;
  if (statusParam === "open") statuses = OPEN_PRESET;
  else if ((WORK_STATUSES as readonly string[]).includes(statusParam)) statuses = [statusParam as WorkStatus];

  const rawFrom = one(sp.from);
  const rawTo = one(sp.to);
  const dates = one(sp.dates); // "all" clears the default range
  let from = rawFrom && DATE_RE.test(rawFrom) ? rawFrom : null;
  let to = rawTo && DATE_RE.test(rawTo) ? rawTo : null;
  let defaultRange = false;
  if (!from && !to && dates !== "all") {
    from = todayIso;
    to = shiftIsoDate(todayIso, 14);
    defaultRange = true;
  }
  if (from && to && to < from) [from, to] = [to, from];

  const sourceRaw = one(sp.source);
  const source = sourceRaw && (JOB_SOURCES as readonly string[]).includes(sourceRaw) ? (sourceRaw as JobSource) : null;

  return {
    statuses,
    statusParam: statuses ? statusParam : "",
    tech: one(sp.tech),
    from,
    to,
    tag: one(sp.tag),
    source,
    q: one(sp.q)?.slice(0, 120) ?? null,
    defaultRange,
  };
}

/** Sort ascending when the range reaches into the future, descending when it lies entirely in the past. */
export function sortDirectionFor(filters: Pick<JobFilters, "from" | "to">, todayIso: string): "asc" | "desc" {
  if (filters.to && filters.to < todayIso) return "desc";
  if (!filters.from && !filters.to) return "desc";
  return "asc";
}

/** Query string for the current filters, with overrides (used by "All dates" / pagination links). */
export function filtersToQuery(f: JobFilters, overrides: Partial<Record<"status" | "tech" | "from" | "to" | "tag" | "source" | "q" | "dates", string | null>> = {}): string {
  const base: Record<string, string | null> = {
    status: f.statusParam || null,
    tech: f.tech,
    from: f.defaultRange ? null : f.from,
    to: f.defaultRange ? null : f.to,
    tag: f.tag,
    source: f.source,
    q: f.q,
    dates: null,
  };
  const merged = { ...base, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Option labels for the Source <select> on /jobs. */
export const JOB_SOURCE_FILTER_LABEL: Record<JobSource, string> = { import: "Imported", agent: "Agent", office: "Office" };

/** "2026-09-02 → 2026-09-16" / "from …" / "through …" / "all dates" for the result summary. */
export function jobRangeText(f: Pick<JobFilters, "from" | "to">): string {
  if (f.from && f.to) return `${f.from} → ${f.to}`;
  if (f.from) return `from ${f.from}`;
  if (f.to) return `through ${f.to}`;
  return "all dates";
}

export function sortOrderLabel(direction: "asc" | "desc"): string {
  if (direction === "asc") return "soonest first";
  return "latest first";
}
