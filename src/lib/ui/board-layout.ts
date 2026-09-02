/**
 * Pure layout math for the Today board. No React, no DB — unit-tested in
 * ./layout.test.ts. Everything is Eastern Time: the grid runs 7 AM – 9 PM ET
 * on the shown calendar day and positions are percentages of that span.
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { BUSINESS_TZ, formatDateTimeET, formatWindow } from "@/lib/time";

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

/** "#1234", or "" when the job has no invoice number. */
export function invoiceTag(invoiceNumber: string | null | undefined): string {
  return invoiceNumber ? `#${invoiceNumber}` : "";
}

/** "Tech: Ana, Ben" or "Unassigned" (card tooltip). */
export function techLine(names: string[]): string {
  return names.length ? `Tech: ${names.join(", ")}` : "Unassigned";
}

/** `/today` for today in ET, otherwise `/today?date=YYYY-MM-DD`. */
export function boardHref(date: string, now: Date = new Date()): string {
  return date === todayET(now) ? "/today" : `/today?date=${date}`;
}

/** `date` unless it is already in the past, then today in ET (the reschedule "from" default). */
export function notBeforeToday(date: string, now: Date = new Date()): string {
  const today = todayET(now);
  return date < today ? today : date;
}

/** Sheet "Window" fact: start + arrival window (default 120 min), or "Not scheduled". */
export function sheetWindowLabel(scheduledStart: string | null, arrivalWindow: number | null): string {
  if (!scheduledStart) return "Not scheduled";
  return formatWindow(scheduledStart, new Date(new Date(scheduledStart).getTime() + (arrivalWindow || 120) * 60_000));
}

/** "3:30 PM EDT" — the ET time of an instant with the "EEE MMM d, yyyy " prefix dropped. */
export function sheetEndLabel(iso: string): string {
  return formatDateTimeET(iso).replace(/^.*?, \d{4} /, "");
}

/** ET date-time without the trailing zone abbreviation (note rows in the sheet). */
export function noteTimeLabel(iso: string): string {
  return formatDateTimeET(iso).replace(/ [A-Z]{3,4}$/, "");
}

// ---------------------------------------------------------------------------
// Lanes & dynamic styles
// ---------------------------------------------------------------------------

/** Height of one stacking lane on the grid (px). */
export const LANE_H = 116;
const CARD_GAP = 4;
/** Height of a tech row with nothing on it (px). */
const EMPTY_ROW_H = 40;

/**
 * Card placement. left/width are per-job percentages of the 7–21 span and
 * top/height follow the stacking lane; continuous values a class cannot
 * express.
 */
export function cardPositionStyle(position: CardPosition, lane: number) {
  return {
    left: `${position.leftPct}%`,
    width: `${position.widthPct}%`,
    top: lane * LANE_H + CARD_GAP,
    height: LANE_H - CARD_GAP * 2,
  } as const;
}

/**
 * Vertical hour lines behind a row, one every 1/BOARD_HOURS of the width.
 * Derived from BOARD_HOURS so a change in business hours keeps the grid true;
 * a repeating gradient sized in percent has no utility class.
 */
export function gridBackgroundStyle() {
  return {
    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    backgroundSize: `${100 / BOARD_HOURS}% 100%`,
  } as const;
}

/**
 * A tech row is as tall as the lanes it stacks (any integer) and carries the
 * hour grid; the height depends on the day's data, not on a fixed class.
 */
export function laneRowStyle(lanes: number, isEmpty: boolean) {
  const height = isEmpty ? EMPTY_ROW_H : lanes * LANE_H;
  return { height, ...gridBackgroundStyle() } as const;
}

/** The "now" marker sits at a percentage of the span that moves every tick. */
export function nowLineStyle(pct: number) {
  return { left: `${pct}%` } as const;
}

/** Hour tick labels sit at computed percentages of the span (one per hour). */
export function hourTickStyle(pct: number) {
  return { left: `${pct}%` } as const;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
