/**
 * Pure layout math for the Today board. No React, no DB — unit-tested in
 * ./layout.test.ts. Everything is Eastern Time: the grid runs 7 AM – 9 PM ET
 * on the shown calendar day and positions are percentages of that span.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "@/lib/time";

export const BOARD_START_HOUR = 7;
export const BOARD_END_HOUR = 21;
export const BOARD_HOURS = BOARD_END_HOUR - BOARD_START_HOUR;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_WIDTH_PCT = 1.5;
const DEFAULT_WINDOW_MIN = 120;

// ---------------------------------------------------------------------------
// Dates (calendar strings, DST-safe)
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" for an instant, in ET. */
export function todayET(now: Date = new Date()): string {
  return formatInTimeZone(now, BUSINESS_TZ, "yyyy-MM-dd");
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** The date the board should show for a `?date=` param: the param when valid, else today in ET. */
export function resolveBoardDate(param: string | string[] | null | undefined, now: Date = new Date()): string {
  const v = Array.isArray(param) ? param[0] : param;
  return isValidDate(v) ? v : todayET(now);
}

/** Calendar arithmetic on the string itself, so DST days are never 23/25 h long. */
export function shiftDate(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`shiftDate: bad date ${date}`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  return new Date(t).toISOString().slice(0, 10);
}

/** "Wednesday, September 2" */
export function longDateLabel(date: string): string {
  return formatInTimeZone(fromZonedTime(`${date}T12:00:00`, BUSINESS_TZ), BUSINESS_TZ, "EEEE, MMMM d");
}

/** The absolute instants that bound the grid on a given ET day. */
export function boardBounds(date: string): { start: Date; end: Date } {
  const hh = (h: number) => String(h).padStart(2, "0");
  return {
    start: fromZonedTime(`${date}T${hh(BOARD_START_HOUR)}:00:00`, BUSINESS_TZ),
    end: fromZonedTime(`${date}T${hh(BOARD_END_HOUR)}:00:00`, BUSINESS_TZ),
  };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type HourTick = { hour: number; label: string; leftPct: number };

/** One tick per hour from 7 AM to 8 PM (the 9 PM edge is the right border). */
export function hourTicks(): HourTick[] {
  const out: HourTick[] = [];
  for (let h = BOARD_START_HOUR; h < BOARD_END_HOUR; h++) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ hour: h, label: `${h12} ${h < 12 ? "AM" : "PM"}`, leftPct: ((h - BOARD_START_HOUR) / BOARD_HOURS) * 100 });
  }
  return out;
}

export type CardPosition = {
  leftPct: number;
  widthPct: number;
  /** The window starts before 7 AM or ends after 9 PM (drawn clipped). */
  clipped: boolean;
  /** The whole window lies outside the grid (drawn as a sliver at the edge). */
  outside: boolean;
};

/**
 * Where a card sits on the grid for `date`. `windowEnd` falls back to
 * start + 2 h. Windows that straddle an edge are clipped; windows entirely
 * outside stick to the nearest edge as a sliver so the job is never lost.
 */
export function positionFor(windowStart: string | Date, windowEnd: string | Date | null | undefined, date: string): CardPosition {
  const { start: b0, end: b1 } = boardBounds(date);
  const span = b1.getTime() - b0.getTime();
  const s = new Date(windowStart).getTime();
  let e = windowEnd ? new Date(windowEnd).getTime() : s + DEFAULT_WINDOW_MIN * 60_000;
  if (!(e > s)) e = s + 30 * 60_000;

  const pct = (t: number) => ((t - b0.getTime()) / span) * 100;

  if (e <= b0.getTime()) return { leftPct: 0, widthPct: MIN_WIDTH_PCT, clipped: true, outside: true };
  if (s >= b1.getTime()) return { leftPct: 100 - MIN_WIDTH_PCT, widthPct: MIN_WIDTH_PCT, clipped: true, outside: true };

  const left = Math.max(0, pct(s));
  const right = Math.min(100, pct(e));
  const width = Math.max(MIN_WIDTH_PCT, right - left);
  return {
    leftPct: round2(left),
    widthPct: round2(Math.min(width, 100 - left)),
    clipped: s < b0.getTime() || e > b1.getTime(),
    outside: false,
  };
}

/** Percent position of "now" on the grid for `date`, or null when not that day / outside 7–21. */
export function nowPct(now: Date, date: string): number | null {
  if (todayET(now) !== date) return null;
  const { start, end } = boardBounds(date);
  if (now < start || now > end) return null;
  return round2(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
}

// ---------------------------------------------------------------------------
// Stacking
// ---------------------------------------------------------------------------

export type Windowed = { window_start: string; window_end: string | null };
export type Stacked<T> = { item: T; lane: number };

/**
 * Greedy interval colouring: sort by start (longer first on ties), give each
 * card the first lane whose last card ended at or before this start.
 * Returns the placed items and the number of lanes used (min 1).
 */
export function stackLanes<T extends Windowed>(items: T[]): { placed: Stacked<T>[]; lanes: number } {
  const withTimes = items.map((item) => {
    const s = new Date(item.window_start).getTime();
    const eRaw = item.window_end ? new Date(item.window_end).getTime() : s + DEFAULT_WINDOW_MIN * 60_000;
    return { item, s, e: eRaw > s ? eRaw : s + 30 * 60_000 };
  });
  withTimes.sort((a, b) => a.s - b.s || b.e - a.e);
  const laneEnds: number[] = [];
  const placed: Stacked<T>[] = [];
  for (const w of withTimes) {
    let lane = laneEnds.findIndex((end) => end <= w.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(w.e);
    } else {
      laneEnds[lane] = w.e;
    }
    placed.push({ item: w.item, lane });
  }
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** "9–11 AM", "11 AM–1 PM", "9:30–11:30 AM" — compact card label in ET. */
export function shortRange(start: string | Date, end: string | Date | null | undefined): string {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const t = (d: Date) => formatInTimeZone(d, BUSINESS_TZ, "h:mm").replace(/:00$/, "");
  const mer = (d: Date) => formatInTimeZone(d, BUSINESS_TZ, "a");
  if (!e) return `${t(s)} ${mer(s)}`;
  return mer(s) === mer(e) ? `${t(s)}–${t(e)} ${mer(e)}` : `${t(s)} ${mer(s)}–${t(e)} ${mer(e)}`;
}

/** "just now", "4m ago", "3h ago", "yesterday", "Aug 28" */
export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = todayET(new Date(t));
  if (day === shiftDate(todayET(now), -1)) return "yesterday";
  return formatInTimeZone(t, BUSINESS_TZ, "MMM d");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
