import { describe, expect, it } from "vitest";
import { fmtWindow, money, relativeDay, unitLabel, visibleTags } from "./format";

const NOW = new Date("2026-09-02T16:00:00Z"); // Wed Sep 2, noon ET

describe("format helpers", () => {
  it("money", () => {
    expect(money(20893)).toBe("$208.93");
    expect(money(181700)).toBe("$1,817");
    expect(money(0, { dash: true })).toBe("—");
  });

  it("relativeDay in ET", () => {
    expect(relativeDay("2026-09-02T23:30:00Z", NOW)).toBe("today"); // 7:30 PM ET
    expect(relativeDay("2026-09-03T14:00:00Z", NOW)).toBe("tomorrow");
    expect(relativeDay("2026-09-01T14:00:00Z", NOW)).toBe("yesterday");
    expect(relativeDay("2026-09-05T14:00:00Z", NOW)).toBe("in 3 days");
    expect(relativeDay("2026-04-30T14:00:00Z", NOW)).toBe("Apr 30");
    expect(relativeDay(null, NOW)).toBe("—");
  });

  it("fmtWindow collapses the meridiem", () => {
    expect(fmtWindow("2026-09-03T14:00:00Z", "2026-09-03T16:00:00Z")).toBe("Thu Sep 3, 10:00 AM–12:00 PM");
    expect(fmtWindow(null)).toBe("Unscheduled");
  });

  it("hides CRM noise tags", () => {
    expect(visibleTags(["Pipeline Automation", "1 Yr Labor Warranty", "Campaigns", "Service Callback"])).toEqual(["1 Yr Labor Warranty", "Service Callback"]);
  });

  it("unitLabel", () => {
    expect(unitLabel("8")).toBe("Unit 8");
    expect(unitLabel("Casa de Egret")).toBe("Casa de Egret");
    expect(unitLabel("Unit 36W")).toBe("Unit 36W");
    expect(unitLabel(null)).toBeNull();
  });
});
