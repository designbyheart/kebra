import { describe, expect, it } from "vitest";
import { BOARD_FILTERS, filterJobs, filterLabel, matchesFilter, nextFilter, showsNeedsScheduling, showsTimeline } from "./board-filter";
import type { BoardJob } from "./board-types";

const job = (id: string, over: Partial<BoardJob> = {}): BoardJob =>
  ({
    job_id: id,
    status: "scheduled",
    tech_ids: ["t1"],
    is_install: false,
    is_callback: false,
    window_start: "2026-09-04T14:00:00Z",
    window_end: "2026-09-04T16:00:00Z",
    priority: "normal",
    ...over,
  }) as unknown as BoardJob;

describe("matchesFilter", () => {
  it("splits assigned live work from unassigned and canceled", () => {
    const assigned = job("j1");
    const unassigned = job("j2", { tech_ids: [] });
    const canceled = job("j3", { status: "user canceled" });
    // A canceled job still carries its tech, so "techs" must exclude it by status.
    const canceledWithTech = job("j4", { status: "pro canceled", tech_ids: ["t1"] });

    expect(matchesFilter(assigned, "techs")).toBe(true);
    expect(matchesFilter(canceledWithTech, "techs")).toBe(false);
    expect(matchesFilter(unassigned, "unassigned")).toBe(true);
    expect(matchesFilter(canceled, "canceled")).toBe(true);
    expect(matchesFilter(assigned, "canceled")).toBe(false);
  });

  it("matches status, install and callback chips", () => {
    expect(matchesFilter(job("j1", { status: "in progress" }), "in_progress")).toBe(true);
    expect(matchesFilter(job("j2", { status: "pending_cancellation" }), "pending_cancellation")).toBe(true);
    expect(matchesFilter(job("j3", { is_install: true }), "installs")).toBe(true);
    expect(matchesFilter(job("j4", { is_callback: true }), "callbacks")).toBe(true);
    expect(matchesFilter(job("j5"), "installs")).toBe(false);
  });

  it("never matches needs_scheduling: those jobs have no window and are not on the timeline", () => {
    for (const j of [job("j1"), job("j2", { tech_ids: [] }), job("j3", { status: "needs scheduling" })]) {
      expect(matchesFilter(j, "needs_scheduling")).toBe(false);
    }
  });

  it("covers every chip in BOARD_FILTERS", () => {
    for (const key of BOARD_FILTERS) {
      expect(() => matchesFilter(job("j1"), key)).not.toThrow();
      expect(filterLabel(key).length).toBeGreaterThan(0);
    }
  });
});

describe("filterJobs", () => {
  const jobs = [job("j1"), job("j2", { tech_ids: [] }), job("j3", { status: "user canceled" }), job("j4", { status: "in progress" })];

  it("returns the same list when nothing is selected", () => {
    expect(filterJobs(jobs, null)).toBe(jobs);
  });

  it("keeps only the selected slice", () => {
    expect(filterJobs(jobs, "unassigned").map((j) => j.job_id)).toEqual(["j2"]);
    expect(filterJobs(jobs, "canceled").map((j) => j.job_id)).toEqual(["j3"]);
    expect(filterJobs(jobs, "techs").map((j) => j.job_id)).toEqual(["j1", "j4"]);
    expect(filterJobs(jobs, "needs_scheduling")).toEqual([]);
  });
});

describe("lane visibility", () => {
  it("shows both lanes unfiltered", () => {
    expect(showsTimeline(null)).toBe(true);
    expect(showsNeedsScheduling(null)).toBe(true);
  });

  it("hides the needs-scheduling lane behind a timeline chip, and the timeline behind its own", () => {
    expect(showsNeedsScheduling("canceled")).toBe(false);
    expect(showsTimeline("canceled")).toBe(true);
    expect(showsTimeline("needs_scheduling")).toBe(false);
    expect(showsNeedsScheduling("needs_scheduling")).toBe(true);
  });
});

describe("nextFilter", () => {
  it("toggles the pressed chip off and clears on the jobs chip", () => {
    expect(nextFilter(null, "canceled")).toBe("canceled");
    expect(nextFilter("canceled", "canceled")).toBe(null);
    expect(nextFilter("canceled", "installs")).toBe("installs");
    expect(nextFilter("canceled", null)).toBe(null);
    expect(nextFilter(null, null)).toBe(null);
  });
});
