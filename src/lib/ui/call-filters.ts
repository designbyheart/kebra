/**
 * Filter chips and URL building for the Calls list. Pure: no React, no DB.
 */
import type { CallFilter, CallListResult } from "@/app/calls/data";

export type CallFilterChipConfig = { key: CallFilter; label: string; count?: keyof CallListResult["counts"] };

export const CALL_FILTER_CHIPS: CallFilterChipConfig[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live", count: "live" },
  { key: "today", label: "Today", count: "today" },
  { key: "review", label: "Needs review", count: "review" },
  { key: "handoffs", label: "Handoffs", count: "handoffs" },
];

/** `/calls`, `/calls?f=live`, `/calls?f=live&q=frozen` — "all" is the default and stays out of the URL. */
export function callsHref(filter: CallFilter, q: string): string {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("f", filter);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/calls?${s}` : "/calls";
}
