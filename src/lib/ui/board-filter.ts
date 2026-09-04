/**
 * Summary-chip filtering for the Today board. Clicking a chip narrows the day
 * to just that slice; clicking it again (or the "jobs" chip) clears. Pure;
 * unit-tested in ./board-filter.test.ts.
 */
import { isCanceledStatus } from "./board-status";
import type { BoardJob } from "./board-types";

export const BOARD_FILTERS = ["techs", "in_progress", "unassigned", "pending_cancellation", "needs_scheduling", "canceled", "installs", "callbacks"] as const;

export type BoardFilterKey = (typeof BOARD_FILTERS)[number];

/**
 * `needs_scheduling` is the odd one out: those jobs have no window, so they
 * live in their own lane rather than on the timeline.
 */
export function isTimelineFilter(key: BoardFilterKey | null): boolean {
  return key !== null && key !== "needs_scheduling";
}

/** Does the timeline show at all under this filter? */
export function showsTimeline(key: BoardFilterKey | null): boolean {
  return key !== "needs_scheduling";
}

/** Does the "Needs scheduling" lane show at all under this filter? */
export function showsNeedsScheduling(key: BoardFilterKey | null): boolean {
  return key === null || key === "needs_scheduling";
}

/** One job against one chip. `needs_scheduling` never matches a windowed job. */
export function matchesFilter(job: BoardJob, key: BoardFilterKey): boolean {
  switch (key) {
    // "N techs" means the techs actually working: assigned, still live work.
    case "techs":
      return job.tech_ids.length > 0 && !isCanceledStatus(job.status);
    case "in_progress":
      return job.status === "in progress";
    case "unassigned":
      return job.tech_ids.length === 0 && !isCanceledStatus(job.status);
    case "pending_cancellation":
      return job.status === "pending_cancellation";
    case "canceled":
      return isCanceledStatus(job.status);
    case "installs":
      return job.is_install;
    case "callbacks":
      return job.is_callback;
    case "needs_scheduling":
      return false;
  }
}

/** The board's jobs under the active chip; the unfiltered list when none is. */
export function filterJobs(jobs: BoardJob[], key: BoardFilterKey | null): BoardJob[] {
  if (key === null) return jobs;
  return jobs.filter((j) => matchesFilter(j, key));
}

const LABEL: Record<BoardFilterKey, string> = {
  techs: "techs working",
  in_progress: "in progress",
  unassigned: "unassigned",
  pending_cancellation: "pending cancellation",
  needs_scheduling: "needs scheduling",
  canceled: "canceled",
  installs: "installs",
  callbacks: "callbacks",
};

/** Sentence for the "showing only …" line under the chips. */
export function filterLabel(key: BoardFilterKey): string {
  return LABEL[key];
}

/** Toggle semantics: pressing the active chip clears it. */
export function nextFilter(current: BoardFilterKey | null, pressed: BoardFilterKey | null): BoardFilterKey | null {
  if (pressed === null) return null;
  return current === pressed ? null : pressed;
}
