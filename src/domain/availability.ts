/**
 * Availability (W1-B). Contract: docs/TOOLS.md `find_availability`.
 *
 * - Business hours come from `business_hours` (per ET weekday, wall-clock
 *   "HH:mm"); candidate windows start every hour on the hour from `open`.
 * - A window is offered when the arrival window (2 h) AND the service
 *   duration both end by `close`.
 * - A tech is free when none of their blocking jobs (scheduled, in progress,
 *   pending_cancellation, needs scheduling with a window) overlaps
 *   [start, start + duration). A job blocks from `scheduled_start` to
 *   `scheduled_end` (start + 2 h when missing), never past the end of the
 *   ET day it starts on (see `busyEndSql`).
 * - Only active employees with role "field tech" are schedulable.
 * - Windows starting at or before `now` are never offered.
 * - Tech ranking per window: preferred tech → tech who did the most recent
 *   completed job at `address_id` → fewest blocking jobs that ET day →
 *   most lifetime jobs (the house's primary techs) → name.
 * - Slots are spread round-robin across the open days in range, at most two
 *   per day unless a single day was requested; within a day the first pick
 *   is the earliest morning window and the second the earliest afternoon
 *   window, never overlapping.
 */
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { businessHours, employees, jobAssignments, jobs, serviceTypes, type BusinessHoursRow } from "@/db/schema";
import { BUSINESS_TZ, isoDateET } from "@/lib/time";
import { ToolError } from "@/agent/errors";
import type { Tx } from "./idempotency";

export type Exec = Db | Tx;

export const SCHEDULABLE_ROLE = "field tech";
export const ARRIVAL_WINDOW_MIN = 120;
export const BLOCKING_STATUSES = ["scheduled", "in progress", "pending_cancellation", "needs scheduling"] as const;
export const SERVICE_TYPE_IDS = ["diagnostic", "repair", "maintenance", "install", "callback", "estimate"] as const;
export type ServiceTypeId = (typeof SERVICE_TYPE_IDS)[number];
const MAX_RANGE_DAYS = 31;

export type SlotReason = "last_tech_here" | "least_loaded" | "only_available";
export type Slot = {
  window_start: string;
  window_end: string;
  window_label: string;
  employee_id: string;
  employee_name: string;
  reason: SlotReason;
};

export type FindAvailabilityParams = {
  from: string;
  to?: string;
  service_type: string;
  priority?: "normal" | "high" | "emergency";
  preferred_employee_id?: string;
  address_id?: string;
  limit?: number;
  /** Injected by tests; defaults to the wall clock. */
  now?: Date;
};

export type Tech = { id: string; name: string; jobs: number };
type Interval = { start: Date; end: Date };

// ---------------------------------------------------------------------------
// Time helpers (all ET wall-clock aware)
// ---------------------------------------------------------------------------

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" → start of that ET day; ISO → the instant. */
export function parseDateInput(value: string, field: string): Date {
  const v = value.trim();
  if (DATE_ONLY.test(v)) return fromZonedTime(`${v}T00:00:00`, BUSINESS_TZ);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new ToolError(
      "validation",
      `${field} is not a date: ${value}`,
      "I didn't catch that date. Which day were you thinking?",
      { field },
    );
  }
  return d;
}

/** Start of the ET calendar day containing `d`. */
export function startOfDayET(d: Date): Date {
  return fromZonedTime(`${isoDateET(d)}T00:00:00`, BUSINESS_TZ);
}

/** 0 = Sunday … 6 = Saturday, in ET. */
export function dowET(d: Date): number {
  return Number(formatInTimeZone(d, BUSINESS_TZ, "i")) % 7;
}

function hourET(d: Date): number {
  return Number(formatInTimeZone(d, BUSINESS_TZ, "H"));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "08:00" on ET date "2026-09-02" → instant (DST handled by the tz db). */
function atWallClock(dateStr: string, hhmm: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}:00`, tz);
}

/** "10 AM", "noon", "1:30 PM" */
export function spokenClock(d: Date): string {
  const h = hourET(d);
  const m = Number(formatInTimeZone(d, BUSINESS_TZ, "m"));
  if (h === 12 && m === 0) return "noon";
  if (h === 0 && m === 0) return "midnight";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mer = h < 12 ? "AM" : "PM";
  return m === 0 ? `${h12} ${mer}` : `${h12}:${pad(m)} ${mer}`;
}

/** "Tuesday September 2, 10 AM to noon" (docs/TOOLS.md "Time"). */
export function windowLabel(start: Date | string, end: Date | string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${formatInTimeZone(s, BUSINESS_TZ, "EEEE MMMM d")}, ${spokenClock(s)} to ${spokenClock(e)}`;
}

/** "today" / "tomorrow" / "Thursday" / "Tuesday September 15" relative to `now`. */
export function spokenDay(d: Date, now: Date = new Date()): string {
  const day = isoDateET(d);
  const today = isoDateET(now);
  if (day === today) return "today";
  if (day === isoDateET(addDays(startOfDayET(now), 1))) return "tomorrow";
  const diffDays = Math.round((startOfDayET(d).getTime() - startOfDayET(now).getTime()) / 86_400_000);
  if (diffDays > 1 && diffDays < 7) return formatInTimeZone(d, BUSINESS_TZ, "EEEE");
  return formatInTimeZone(d, BUSINESS_TZ, "EEEE MMMM d");
}

/** Hour words for a phone sentence: "10", "noon", "1". */
function spokenHour(d: Date): string {
  const h = hourET(d);
  const m = Number(formatInTimeZone(d, BUSINESS_TZ, "m"));
  if (h === 12 && m === 0) return "noon";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? String(h12) : `${h12}:${pad(m)}`;
}

/**
 * "Tuesday between 10 and noon with Tanya" (first) /
 * "Wednesday 1 to 3 with Felix" (rest). Joined by the caller.
 */
export function spokenSlot(slot: Slot, now: Date, first: boolean): string {
  const s = new Date(slot.window_start);
  const e = new Date(slot.window_end);
  const day = spokenDay(s, now);
  const times = first ? `between ${spokenHour(s)} and ${spokenHour(e)}` : `${spokenHour(s)} to ${spokenHour(e)}`;
  return `${day} ${times} with ${firstName(slot.employee_name)}`;
}

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function joinSpoken(items: string[], conj = "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}, ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export async function loadServiceType(exec: Exec, id: string) {
  const [row] = await exec
    .select({ id: serviceTypes.id, name: serviceTypes.name, durationMinutes: serviceTypes.durationMinutes })
    .from(serviceTypes)
    .where(and(eq(serviceTypes.id, id), eq(serviceTypes.active, true)))
    .limit(1);
  if (!row) {
    throw new ToolError(
      "not_found",
      `unknown service type ${id}`,
      "I don't have that kind of visit on the books. Is this a diagnostic, a repair, maintenance, or an estimate?",
    );
  }
  return row;
}

export async function loadTechs(exec: Exec): Promise<Tech[]> {
  const rows = await exec
    .select({ id: employees.id, first: employees.firstName, last: employees.lastName, jobs: employees.jobs })
    .from(employees)
    .where(and(eq(employees.role, SCHEDULABLE_ROLE), eq(employees.active, true)));
  return rows.map((r) => ({ id: r.id, name: `${r.first} ${r.last}`.trim(), jobs: r.jobs }));
}

export async function loadTech(exec: Exec, employeeId: string): Promise<Tech | null> {
  const [r] = await exec
    .select({ id: employees.id, first: employees.firstName, last: employees.lastName, jobs: employees.jobs })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.role, SCHEDULABLE_ROLE), eq(employees.active, true)))
    .limit(1);
  return r ? { id: r.id, name: `${r.first} ${r.last}`.trim(), jobs: r.jobs } : null;
}

export async function loadHours(exec: Exec): Promise<Map<number, BusinessHoursRow>> {
  const rows = await exec.select().from(businessHours);
  return new Map(rows.map((r) => [r.dow, r]));
}

type BusyRow = { jobId: string; employeeId: string; start: Date; end: Date };

/**
 * When a job stops blocking its tech: `scheduled_end` (or start + 2 h when
 * missing), capped at the end of the ET day the job starts on. The import
 * carries a few "scheduled" rows whose end is weeks after their start; read
 * literally they would take the busiest techs off the board for days.
 */
function busyEndSql() {
  return sql`least(
    coalesce(${jobs.scheduledEnd}, ${jobs.scheduledStart} + make_interval(mins => ${ARRIVAL_WINDOW_MIN})),
    (date_trunc('day', ${jobs.scheduledStart} at time zone ${BUSINESS_TZ}) + interval '1 day') at time zone ${BUSINESS_TZ}
  )`;
}

/** Blocking jobs (with a tech) overlapping [rangeStart, rangeEnd). */
async function loadBusy(exec: Exec, rangeStart: Date, rangeEnd: Date, employeeIds: string[]): Promise<BusyRow[]> {
  if (employeeIds.length === 0) return [];
  const rows = await exec
    .select({
      jobId: jobs.id,
      employeeId: jobAssignments.employeeId,
      start: jobs.scheduledStart,
      end: sql<Date>`${busyEndSql()}`,
    })
    .from(jobs)
    .innerJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
    .where(
      and(
        inArray(jobs.workStatus, [...BLOCKING_STATUSES]),
        isNotNull(jobs.scheduledStart),
        inArray(jobAssignments.employeeId, employeeIds),
        lt(jobs.scheduledStart, rangeEnd),
        // Raw Date params bypass drizzle's column mapping, so pass ISO text.
        sql`${busyEndSql()} > ${rangeStart.toISOString()}::timestamptz`,
      ),
    );
  return rows.map((r) => ({ jobId: r.jobId, employeeId: r.employeeId, start: r.start as Date, end: new Date(r.end) }));
}

/**
 * True when `employeeId` has no blocking job overlapping
 * [start, start + durationMin). `excludeJobId` lets a reschedule ignore the
 * job being moved. Callers that go on to write should hold
 * `pg_advisory_xact_lock(hashtext('tech:' || employee_id))` first.
 */
export async function isTechFree(
  exec: Exec,
  employeeId: string,
  start: Date,
  durationMin: number,
  excludeJobId?: string,
): Promise<boolean> {
  const end = addMinutes(start, durationMin);
  const busy = await loadBusy(exec, start, end, [employeeId]);
  return busy.every((b) => b.jobId === excludeJobId);
}

/** Field techs on the most recent completed job at the address (may be several). */
export async function lastTechsAt(exec: Exec, addressId: string): Promise<string[]> {
  const [last] = await exec
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
    .where(
      and(
        eq(jobs.addressId, addressId),
        inArray(jobs.workStatus, ["complete rated", "complete unrated"]),
        eq(employees.role, SCHEDULABLE_ROLE),
      ),
    )
    .orderBy(sql`coalesce(${jobs.completedAt}, ${jobs.scheduledStart}, ${jobs.createdAt}) desc`)
    .limit(1);
  if (!last) return [];
  const techs = await exec
    .select({ employeeId: jobAssignments.employeeId })
    .from(jobAssignments)
    .innerJoin(employees, eq(employees.id, jobAssignments.employeeId))
    .where(and(eq(jobAssignments.jobId, last.id), eq(employees.role, SCHEDULABLE_ROLE)));
  return techs.map((t) => t.employeeId);
}

// ---------------------------------------------------------------------------
// Window generation
// ---------------------------------------------------------------------------

/** Candidate arrival-window starts for one ET date, or [] when closed. */
export function windowsForDay(dateStr: string, hours: BusinessHoursRow | undefined, durationMin: number): Interval[] {
  if (!hours || hours.closed || !hours.open || !hours.close) return [];
  const tz = hours.tz || BUSINESS_TZ;
  const open = atWallClock(dateStr, hours.open, tz);
  const close = atWallClock(dateStr, hours.close, tz);
  const [, openMin = "00"] = hours.open.split(":");
  const out: Interval[] = [];
  for (let h = Number(hours.open.slice(0, 2)); h < 24; h++) {
    const start = atWallClock(dateStr, `${pad(h)}:${openMin}`, tz);
    if (start < open) continue;
    const arrivalEnd = addMinutes(start, ARRIVAL_WINDOW_MIN);
    const jobEnd = addMinutes(start, durationMin);
    if (arrivalEnd > close || jobEnd > close) break;
    out.push({ start, end: arrivalEnd });
  }
  return out;
}

/** Is `start` a legal window start on its ET day (inside hours, on the hour)? */
export function isWithinHours(start: Date, hours: Map<number, BusinessHoursRow>, durationMin: number): boolean {
  const row = hours.get(dowET(start));
  return windowsForDay(isoDateET(start), row, durationMin).some((w) => w.start.getTime() === start.getTime());
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

// ---------------------------------------------------------------------------
// findAvailability
// ---------------------------------------------------------------------------

type Candidate = { slot: Slot; start: Date };

export async function findAvailability(
  params: FindAvailabilityParams,
  exec: Exec = db,
): Promise<{ slots: Slot[]; range: { from: string; to: string }; closed_days: string[] }> {
  const now = params.now ?? new Date();
  const limit = Math.max(1, Math.min(params.limit ?? 4, 12));

  const from = parseDateInput(params.from, "from");
  let to: Date;
  if (params.to) {
    to = DATE_ONLY.test(params.to.trim()) ? addDays(parseDateInput(params.to, "to"), 1) : parseDateInput(params.to, "to");
  } else {
    to = addDays(startOfDayET(from), 4); // from + 3 days, inclusive
  }
  if (to <= from) {
    throw new ToolError("validation", "to must be after from", "That date range is backwards. Which days should I check?", {
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }
  const maxTo = addDays(startOfDayET(from), MAX_RANGE_DAYS);
  if (to > maxTo) to = maxTo;

  const service = await loadServiceType(exec, params.service_type);
  const hours = await loadHours(exec);
  const allTechs = await loadTechs(exec);
  if (allTechs.length === 0) return { slots: [], range: isoRange(from, to), closed_days: [] };

  const preferredId = params.preferred_employee_id && allTechs.some((t) => t.id === params.preferred_employee_id)
    ? params.preferred_employee_id
    : null;
  const lastTechs = params.address_id ? new Set(await lastTechsAt(exec, params.address_id)) : new Set<string>();

  const busy = await loadBusy(
    exec,
    from,
    to,
    allTechs.map((t) => t.id),
  );
  const busyByTech = new Map<string, Interval[]>();
  const loadByTechDay = new Map<string, number>();
  for (const b of busy) {
    const list = busyByTech.get(b.employeeId) ?? [];
    list.push({ start: b.start, end: b.end });
    busyByTech.set(b.employeeId, list);
    const key = `${b.employeeId}|${isoDateET(b.start)}`;
    loadByTechDay.set(key, (loadByTechDay.get(key) ?? 0) + 1);
  }

  const singleDay = isoDateET(from) === isoDateET(addMinutes(to, -1));
  const perDayCap = singleDay ? limit : 2;

  const closedDays: string[] = [];
  const picksByDay: Candidate[][] = [];

  for (let day = startOfDayET(from); day < to; day = addDays(day, 1)) {
    const dateStr = isoDateET(day);
    const row = hours.get(dowET(day));
    const windows = windowsForDay(dateStr, row, service.durationMinutes).filter(
      (w) => w.start >= from && w.start > now && w.start < to,
    );
    if (!row || row.closed) {
      closedDays.push(dateStr);
      continue;
    }
    if (windows.length === 0) continue;

    const candidates: Candidate[] = [];
    for (const w of windows) {
      const occupancy: Interval = { start: w.start, end: addMinutes(w.start, service.durationMinutes) };
      const free = allTechs.filter((t) => !(busyByTech.get(t.id) ?? []).some((b) => overlaps(b, occupancy)));
      if (free.length === 0) continue;
      const ranked = [...free].sort((a, b) => rankKey(a, dateStr) - rankKey(b, dateStr) || a.name.localeCompare(b.name));
      const best = ranked[0];
      const reason: SlotReason = free.length === 1 ? "only_available" : lastTechs.has(best.id) ? "last_tech_here" : "least_loaded";
      candidates.push({
        start: w.start,
        slot: {
          window_start: w.start.toISOString(),
          window_end: w.end.toISOString(),
          window_label: windowLabel(w.start, w.end),
          employee_id: best.id,
          employee_name: best.name,
          reason,
        },
      });
    }
    if (candidates.length === 0) continue;

    // Earliest morning window, then earliest afternoon window, then any other
    // non-overlapping window, up to the per-day cap.
    const picks: Candidate[] = [];
    const morning = candidates.find((c) => hourET(c.start) < 12);
    const afternoon = candidates.find((c) => hourET(c.start) >= 12);
    if (morning) picks.push(morning);
    if (afternoon && picks.length < perDayCap) picks.push(afternoon);
    for (const c of candidates) {
      if (picks.length >= perDayCap) break;
      if (picks.includes(c)) continue;
      const clear = picks.every((p) => Math.abs(p.start.getTime() - c.start.getTime()) >= ARRIVAL_WINDOW_MIN * 60_000);
      if (clear) picks.push(c);
    }
    picks.sort((a, b) => a.start.getTime() - b.start.getTime());
    picksByDay.push(picks);
  }

  // Round-robin across days so four slots land on four days when possible.
  const chosen: Candidate[] = [];
  for (let round = 0; chosen.length < limit; round++) {
    let added = false;
    for (const picks of picksByDay) {
      if (chosen.length >= limit) break;
      const c = picks[round];
      if (c) {
        chosen.push(c);
        added = true;
      }
    }
    if (!added) break;
  }
  chosen.sort((a, b) => a.start.getTime() - b.start.getTime());

  return { slots: chosen.map((c) => c.slot), range: isoRange(from, to), closed_days: closedDays };

  function rankKey(t: Tech, dateStr: string): number {
    // Lower is better. Buckets are wide enough that a higher-priority term
    // always dominates the lower ones.
    const pref = preferredId && t.id === preferredId ? 0 : 1;
    const last = lastTechs.has(t.id) ? 0 : 1;
    const load = Math.min(loadByTechDay.get(`${t.id}|${dateStr}`) ?? 0, 99);
    const seniority = 999_999 - Math.min(t.jobs, 999_999); // more lifetime jobs → smaller
    return pref * 1e12 + last * 1e10 + load * 1e7 + seniority;
  }
}

function isoRange(from: Date, to: Date) {
  return { from: from.toISOString(), to: to.toISOString() };
}
