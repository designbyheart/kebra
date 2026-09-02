import { describe, expect, it } from "vitest";
import { filtersToQuery, jobRangeText, parseJobFilters, shiftIsoDate, sortDirectionFor, sortOrderLabel } from "./job-filter-params";

const TODAY = "2026-09-02";

describe("parseJobFilters", () => {
  it("defaults to today → +14 days when no dates are given", () => {
    const f = parseJobFilters({}, TODAY);
    expect(f.from).toBe("2026-09-02");
    expect(f.to).toBe("2026-09-16");
    expect(f.defaultRange).toBe(true);
    expect(f.statuses).toBeNull();
  });

  it("dates=all clears the default range", () => {
    const f = parseJobFilters({ dates: "all" }, TODAY);
    expect(f.from).toBeNull();
    expect(f.to).toBeNull();
    expect(f.defaultRange).toBe(false);
  });

  it("expands the open preset and accepts a single status", () => {
    expect(parseJobFilters({ status: "open" }, TODAY).statuses).toEqual(["scheduled", "in progress", "needs scheduling", "pending_cancellation"]);
    expect(parseJobFilters({ status: "in progress" }, TODAY).statuses).toEqual(["in progress"]);
    expect(parseJobFilters({ status: "bogus" }, TODAY).statuses).toBeNull();
    expect(parseJobFilters({ status: "bogus" }, TODAY).statusParam).toBe("");
  });

  it("rejects malformed dates and swaps a backwards range", () => {
    const f = parseJobFilters({ from: "2026-09-10", to: "2026-09-01" }, TODAY);
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBe("2026-09-10");
    const g = parseJobFilters({ from: "yesterday" }, TODAY);
    expect(g.from).toBe(TODAY); // fell back to the default range
    expect(g.defaultRange).toBe(true);
  });

  it("only accepts known sources and trims q", () => {
    expect(parseJobFilters({ source: "agent" }, TODAY).source).toBe("agent");
    expect(parseJobFilters({ source: "vapi" }, TODAY).source).toBeNull();
    expect(parseJobFilters({ q: "  grouper  " }, TODAY).q).toBe("grouper");
  });
});

describe("sortDirectionFor", () => {
  it("is ascending for ranges reaching the future and descending for the past", () => {
    expect(sortDirectionFor({ from: "2026-09-02", to: "2026-09-16" }, TODAY)).toBe("asc");
    expect(sortDirectionFor({ from: "2026-08-01", to: "2026-08-31" }, TODAY)).toBe("desc");
    expect(sortDirectionFor({ from: null, to: null }, TODAY)).toBe("desc");
  });
});

describe("shiftIsoDate / filtersToQuery", () => {
  it("shifts across month ends", () => {
    expect(shiftIsoDate("2026-08-25", 14)).toBe("2026-09-08");
  });
  it("omits default dates and applies overrides", () => {
    const f = parseJobFilters({ status: "open", tech: "pro_1" }, TODAY);
    expect(filtersToQuery(f)).toBe("?status=open&tech=pro_1");
    expect(filtersToQuery(f, { dates: "all" })).toBe("?status=open&tech=pro_1&dates=all");
  });
});

describe("jobRangeText / sortOrderLabel", () => {
  it("describes the active date range", () => {
    expect(jobRangeText({ from: "2026-09-02", to: "2026-09-16" })).toBe("2026-09-02 → 2026-09-16");
    expect(jobRangeText({ from: "2026-09-02", to: null })).toBe("from 2026-09-02");
    expect(jobRangeText({ from: null, to: "2026-09-16" })).toBe("through 2026-09-16");
    expect(jobRangeText({ from: null, to: null })).toBe("all dates");
  });
  it("labels the sort order", () => {
    expect(sortOrderLabel("asc")).toBe("soonest first");
    expect(sortOrderLabel("desc")).toBe("latest first");
  });
});
