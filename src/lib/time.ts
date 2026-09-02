import { format } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

export const BUSINESS_TZ = "America/New_York";

/** Wall-clock Date in ET (for date-fns math on ET fields). */
export function toET(d: Date | string | number): Date {
  return toZonedTime(new Date(d), BUSINESS_TZ);
}

/** Inverse of toET: interpret an ET wall-clock Date as an instant. */
export function fromET(d: Date): Date {
  return fromZonedTime(d, BUSINESS_TZ);
}

/** Current time as an ET wall-clock Date. */
export function nowET(): Date {
  return toET(new Date());
}

/** e.g. "Tue Sep 2" */
export function formatDayET(d: Date | string | number): string {
  return formatInTimeZone(new Date(d), BUSINESS_TZ, "EEE MMM d");
}

/** e.g. "10:00 AM" */
export function formatTimeET(d: Date | string | number): string {
  return formatInTimeZone(new Date(d), BUSINESS_TZ, "h:mm a");
}

/** e.g. "Tue Sep 2, 2026 10:00 AM EDT" */
export function formatDateTimeET(d: Date | string | number): string {
  return formatInTimeZone(new Date(d), BUSINESS_TZ, "EEE MMM d, yyyy h:mm a zzz");
}

/**
 * "Tue Sep 2, 10:00 AM–12:00 PM". Collapses the meridiem when both ends share
 * it ("10:00–11:30 AM"). Spans a day boundary → both dates are printed.
 */
export function formatWindow(start: Date | string | number, end: Date | string | number): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = formatDayET(s);
  const sameDay = formatInTimeZone(s, BUSINESS_TZ, "yyyy-MM-dd") === formatInTimeZone(e, BUSINESS_TZ, "yyyy-MM-dd");
  const sMer = formatInTimeZone(s, BUSINESS_TZ, "a");
  const eMer = formatInTimeZone(e, BUSINESS_TZ, "a");
  const sTime = formatInTimeZone(s, BUSINESS_TZ, "h:mm");
  const eTime = formatInTimeZone(e, BUSINESS_TZ, "h:mm");
  if (!sameDay) return `${day}, ${sTime} ${sMer} – ${formatDayET(e)}, ${eTime} ${eMer}`;
  if (sMer === eMer) return `${day}, ${sTime}–${eTime} ${eMer}`;
  return `${day}, ${sTime} ${sMer}–${eTime} ${eMer}`;
}

/** ISO date (yyyy-MM-dd) for an instant, in ET. */
export function isoDateET(d: Date | string | number): string {
  return formatInTimeZone(new Date(d), BUSINESS_TZ, "yyyy-MM-dd");
}

export { format };
