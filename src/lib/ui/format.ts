/**
 * Small display helpers shared by the customer, address, job and inbox
 * screens. Everything shown to the office is Eastern Time (src/lib/time.ts).
 */
import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_TZ, formatDayET, formatTimeET, formatWindow, isoDateET } from "@/lib/time";

/** "$208.93" / "$1,817" for whole dollars; "—" for zero when `dash` is set. */
export function money(cents: number | null | undefined, opts: { dash?: boolean } = {}): string {
  const n = cents ?? 0;
  if (n === 0 && opts.dash) return "—";
  const d = n / 100;
  const whole = Number.isInteger(d);
  return `$${d.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "Sep 2, 2026" */
export function fmtDate(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), BUSINESS_TZ, "MMM d, yyyy");
}

/** "Tue Sep 2, 10:00 AM" */
export function fmtDateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  return `${formatDayET(d)}, ${formatTimeET(d)}`;
}

/** Arrival window "Tue Sep 2, 10:00 AM–12:00 PM"; start only when no end. */
export function fmtWindow(start: Date | string | number | null | undefined, end?: Date | string | number | null): string {
  if (!start) return "Unscheduled";
  if (!end) return fmtDateTime(start);
  return formatWindow(start, end);
}

/** "today" / "tomorrow" / "yesterday" / "in 3 days" / "5 days ago" / "Sep 2". */
export function relativeDay(d: Date | string | number | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const target = isoDateET(d);
  const today = isoDateET(now);
  if (target === today) return "today";
  const days = Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days < 14) return `in ${days} days`;
  if (days < -1 && days > -14) return `${-days} days ago`;
  return formatInTimeZone(new Date(d), BUSINESS_TZ, days > 0 || days < -300 ? "MMM d, yyyy" : "MMM d");
}

/** "2m ago" / "3h ago" / "yesterday" for event feeds. */
export function relativeTime(d: Date | string | number, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(d).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return relativeDay(d, now);
}

/** "Pipeline Automation" and "Campaigns" are CRM noise; keep the tags an office person cares about. */
const NOISE_TAG_RE = /^(pipeline automation|campaigns|ai-ready-for-review|auto-voice|customer portal)$/i;
export function visibleTags(tags: string[]): string[] {
  return tags.filter((t) => !NOISE_TAG_RE.test(t.trim()));
}

/** Customer kind pill text. */
export function kindLabel(kind: string | null | undefined, company?: string | null): string {
  if (kind === "business") return "Business";
  if (company) return "Business";
  return "Homeowner";
}

/** "Casa de Egret" → "Casa de Egret", "8" → "Unit 8". */
export function unitLabel(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return /^(unit|apt|apartment|suite|ste|bldg|building|casa|cottage|villa)\b/i.test(unit) ? unit : `Unit ${unit}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** The word alone: pluralWord(1, "job") → "job", pluralWord(3, "job") → "jobs". */
export function pluralWord(n: number, one: string, many = `${one}s`): string {
  if (n === 1) return one;
  return many;
}

/** "3 matches" / "1 match" for search result headings. */
export function matchCount(n: number): string {
  return pluralize(n, "match", "matches");
}

/** `+19346478409` → `+1 (934) 647-8409`; anything else is returned as-is. */
export function formatPhoneIntl(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

/** `+13055550142` → `(305) 555-0142`; anything else is returned as-is. */
export function formatPhoneLocal(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}

/** Service duration for a select option: 60 → "1 h", 90 → "1.5 h", 45 → "45 min". */
export function durationLabel(minutes: number): string {
  if (minutes >= 60) return `${minutes / 60} h`;
  return `${minutes} min`;
}
