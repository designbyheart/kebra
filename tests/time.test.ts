import { describe, expect, it } from "vitest";
import { formatWindow, isoDateET } from "@/lib/time";

describe("time helpers", () => {
  it("formats a same-meridiem window", () => {
    // 2026-09-02 10:00–11:30 EDT = 14:00–15:30Z
    expect(formatWindow("2026-09-02T14:00:00Z", "2026-09-02T15:30:00Z")).toBe("Wed Sep 2, 10:00–11:30 AM");
  });
  it("formats a cross-meridiem window", () => {
    expect(formatWindow("2026-09-02T14:00:00Z", "2026-09-02T16:00:00Z")).toBe("Wed Sep 2, 10:00 AM–12:00 PM");
  });
  it("converts instants to ET dates", () => {
    expect(isoDateET("2026-09-03T02:30:00Z")).toBe("2026-09-02");
  });
});
