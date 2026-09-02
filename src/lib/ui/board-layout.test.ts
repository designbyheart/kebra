import { describe, expect, it } from "vitest";
import {
  boardHref,
  cardPositionStyle,
  gridBackgroundStyle,
  hourTicks,
  invoiceTag,
  laneRowStyle,
  notBeforeToday,
  noteTimeLabel,
  sheetEndLabel,
  sheetWindowLabel,
  techLine,
  isValidDate,
  nowPct,
  positionFor,
  relativeTime,
  resolveBoardDate,
  shiftDate,
  shortRange,
  stackLanes,
  todayET,
} from "./board-layout";

// 10 AM ET on the grid: (10 - 7) / 14
const TEN_AM_PCT = (3 / 14) * 100;
const TWO_HOURS_PCT = (2 / 14) * 100;

describe("date parsing in ET", () => {
  it("todayET follows the Eastern calendar, not UTC", () => {
    // 03:59 UTC on Sep 3 is still 11:59 PM Sep 2 in EDT
    expect(todayET(new Date("2026-09-03T03:59:00Z"))).toBe("2026-09-02");
    expect(todayET(new Date("2026-09-03T04:00:00Z"))).toBe("2026-09-03");
    // Winter (EST, UTC-5)
    expect(todayET(new Date("2026-01-10T04:59:00Z"))).toBe("2026-01-09");
    expect(todayET(new Date("2026-01-10T05:00:00Z"))).toBe("2026-01-10");
  });

  it("validates calendar dates", () => {
    expect(isValidDate("2026-09-02")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("tomorrow")).toBe(false);
    expect(isValidDate("")).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });

  it("resolveBoardDate falls back to today in ET", () => {
    const now = new Date("2026-09-03T02:00:00Z"); // 10 PM Sep 2 ET
    expect(resolveBoardDate("2026-09-15", now)).toBe("2026-09-15");
    expect(resolveBoardDate(undefined, now)).toBe("2026-09-02");
    expect(resolveBoardDate("2026-02-30", now)).toBe("2026-09-02");
    expect(resolveBoardDate(["2026-09-04", "2026-09-05"], now)).toBe("2026-09-04");
  });

  it("shiftDate is plain calendar arithmetic across DST and month edges", () => {
    expect(shiftDate("2026-03-07", 1)).toBe("2026-03-08"); // spring forward day
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01"); // fall back day
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2026-09-02", 0)).toBe("2026-09-02");
  });
});

describe("window → column offsets", () => {
  it("places a 10 AM – noon EDT window at 3/14 with a 2/14 width", () => {
    const p = positionFor("2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z", "2026-09-02");
    expect(p.leftPct).toBeCloseTo(TEN_AM_PCT, 1);
    expect(p.widthPct).toBeCloseTo(TWO_HOURS_PCT, 1);
    expect(p.clipped).toBe(false);
    expect(p.outside).toBe(false);
  });

  it("uses ET wall-clock on both sides of DST", () => {
    // Spring-forward day: 10 AM EDT = 14:00Z
    const spring = positionFor("2026-03-08T14:00:00Z", "2026-03-08T16:00:00Z", "2026-03-08");
    expect(spring.leftPct).toBeCloseTo(TEN_AM_PCT, 1);
    // Fall-back day: 10 AM EST = 15:00Z
    const fall = positionFor("2026-11-01T15:00:00Z", "2026-11-01T17:00:00Z", "2026-11-01");
    expect(fall.leftPct).toBeCloseTo(TEN_AM_PCT, 1);
    // Winter: 10 AM EST = 15:00Z
    const winter = positionFor("2026-01-15T15:00:00Z", "2026-01-15T17:00:00Z", "2026-01-15");
    expect(winter.leftPct).toBeCloseTo(TEN_AM_PCT, 1);
    expect(winter.widthPct).toBeCloseTo(TWO_HOURS_PCT, 1);
  });

  it("defaults a missing end to a 2 h window", () => {
    const p = positionFor("2026-09-02T14:00:00Z", null, "2026-09-02");
    expect(p.widthPct).toBeCloseTo(TWO_HOURS_PCT, 1);
  });

  it("clips windows that straddle the 7 AM / 9 PM edges", () => {
    const early = positionFor("2026-09-02T10:00:00Z", "2026-09-02T12:00:00Z", "2026-09-02"); // 6–8 AM
    expect(early.leftPct).toBe(0);
    expect(early.widthPct).toBeCloseTo((1 / 14) * 100, 1);
    expect(early.clipped).toBe(true);
    expect(early.outside).toBe(false);

    const late = positionFor("2026-09-03T00:00:00Z", "2026-09-03T02:00:00Z", "2026-09-02"); // 8–10 PM
    expect(late.leftPct).toBeCloseTo((13 / 14) * 100, 1);
    expect(late.leftPct + late.widthPct).toBeCloseTo(100, 1);
    expect(late.clipped).toBe(true);
  });

  it("pins fully-outside windows to the nearest edge as a sliver", () => {
    const before = positionFor("2026-09-02T08:00:00Z", "2026-09-02T10:00:00Z", "2026-09-02"); // 4–6 AM
    expect(before.outside).toBe(true);
    expect(before.leftPct).toBe(0);
    const after = positionFor("2026-09-03T02:00:00Z", "2026-09-03T03:00:00Z", "2026-09-02"); // 10–11 PM
    expect(after.outside).toBe(true);
    expect(after.leftPct + after.widthPct).toBeCloseTo(100, 1);
  });

  it("never lets a card be narrower than the minimum", () => {
    const p = positionFor("2026-09-02T14:00:00Z", "2026-09-02T14:05:00Z", "2026-09-02");
    expect(p.widthPct).toBeGreaterThanOrEqual(1.5);
  });

  it("draws 14 hour ticks from 7 AM", () => {
    const ticks = hourTicks();
    expect(ticks).toHaveLength(14);
    expect(ticks[0]).toEqual({ hour: 7, label: "7 AM", leftPct: 0 });
    expect(ticks[5].label).toBe("12 PM");
    expect(ticks[13].label).toBe("8 PM");
  });

  it("nowPct only appears on the shown day and inside the grid", () => {
    expect(nowPct(new Date("2026-09-02T14:00:00Z"), "2026-09-02")).toBeCloseTo(TEN_AM_PCT, 1);
    expect(nowPct(new Date("2026-09-02T14:00:00Z"), "2026-09-03")).toBeNull();
    expect(nowPct(new Date("2026-09-02T09:00:00Z"), "2026-09-02")).toBeNull(); // 5 AM
  });
});

describe("overlapping cards stack", () => {
  const j = (id: string, s: string, e: string | null) => ({ id, window_start: s, window_end: e });

  it("gives overlapping windows separate lanes and reuses free ones", () => {
    const { placed, lanes } = stackLanes([
      j("a", "2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z"),
      j("b", "2026-09-02T15:00:00Z", "2026-09-02T17:00:00Z"),
      j("c", "2026-09-02T16:00:00Z", "2026-09-02T18:00:00Z"), // starts when a ends → lane 0
      j("d", "2026-09-02T19:00:00Z", "2026-09-02T21:00:00Z"),
    ]);
    const lane = Object.fromEntries(placed.map((p) => [p.item.id, p.lane]));
    expect(lane).toEqual({ a: 0, b: 1, c: 0, d: 0 });
    expect(lanes).toBe(2);
  });

  it("stacks three simultaneous windows in three lanes", () => {
    const { lanes } = stackLanes([
      j("a", "2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z"),
      j("b", "2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z"),
      j("c", "2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z"),
    ]);
    expect(lanes).toBe(3);
  });

  it("treats a missing end as 2 h and sorts by start", () => {
    const { placed, lanes } = stackLanes([
      j("late", "2026-09-02T18:00:00Z", null),
      j("early", "2026-09-02T14:00:00Z", null),
      j("mid", "2026-09-02T15:00:00Z", null),
    ]);
    expect(placed.map((p) => p.item.id)).toEqual(["early", "mid", "late"]);
    expect(lanes).toBe(2);
  });

  it("always reports at least one lane", () => {
    expect(stackLanes([]).lanes).toBe(1);
  });
});

describe("labels", () => {
  it("shortRange collapses the meridiem and drops :00", () => {
    expect(shortRange("2026-09-02T13:00:00Z", "2026-09-02T15:00:00Z")).toBe("9–11 AM");
    expect(shortRange("2026-09-02T15:00:00Z", "2026-09-02T17:00:00Z")).toBe("11 AM–1 PM");
    expect(shortRange("2026-09-02T13:30:00Z", "2026-09-02T15:30:00Z")).toBe("9:30–11:30 AM");
    expect(shortRange("2026-09-02T13:00:00Z", null)).toBe("9 AM");
  });

  it("relativeTime", () => {
    const now = new Date("2026-09-02T16:00:00Z");
    expect(relativeTime("2026-09-02T15:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-02T15:56:00Z", now)).toBe("4m ago");
    expect(relativeTime("2026-09-02T13:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-01T14:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-08-28T14:00:00Z", now)).toBe("Aug 28");
  });
});

describe("board labels and dynamic styles", () => {
  it("builds card and sheet labels", () => {
    expect(invoiceTag("1234")).toBe("#1234");
    expect(invoiceTag(null)).toBe("");
    expect(techLine(["Ana", "Ben"])).toBe("Tech: Ana, Ben");
    expect(techLine([])).toBe("Unassigned");
    expect(sheetWindowLabel(null, null)).toBe("Not scheduled");
    expect(sheetWindowLabel("2026-09-02T14:00:00Z", null)).toBe("Wed Sep 2, 10:00 AM–12:00 PM");
    expect(sheetWindowLabel("2026-09-02T14:00:00Z", 60)).toBe("Wed Sep 2, 10:00–11:00 AM");
    expect(sheetEndLabel("2026-09-02T16:00:00Z")).toBe("12:00 PM EDT");
    expect(noteTimeLabel("2026-09-02T16:00:00Z")).toBe("Wed Sep 2, 2026 12:00 PM");
  });

  it("links to /today for today and clamps the reschedule start", () => {
    const now = new Date("2026-09-02T16:00:00Z");
    expect(boardHref("2026-09-02", now)).toBe("/today");
    expect(boardHref("2026-09-03", now)).toBe("/today?date=2026-09-03");
    expect(notBeforeToday("2026-08-30", now)).toBe("2026-09-02");
    expect(notBeforeToday("2026-09-05", now)).toBe("2026-09-05");
  });

  it("computes the only styles that cannot be classes", () => {
    expect(cardPositionStyle({ leftPct: 21.43, widthPct: 14.29, clipped: false, outside: false }, 1)).toEqual({ left: "21.43%", width: "14.29%", top: 120, height: 108 });
    expect(laneRowStyle(2, false)).toMatchObject({ height: 232 });
    expect(laneRowStyle(1, true)).toMatchObject({ height: 40 });
    expect(gridBackgroundStyle().backgroundSize).toBe(`${100 / 14}% 100%`);
  });
});
