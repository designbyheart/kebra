import { describe, expect, it } from "vitest";
import { isActiveCallStatus, nowEastern, volumeBarStyle } from "./web-call";

describe("web-call helpers", () => {
  it("maps the 0–1 level to a clamped whole-percent width", () => {
    expect(volumeBarStyle(0)).toEqual({ width: "0%" });
    expect(volumeBarStyle(0.456)).toEqual({ width: "46%" });
    expect(volumeBarStyle(1.7)).toEqual({ width: "100%" });
  });

  it("knows which statuses are on the wire", () => {
    expect(["connecting", "listening", "speaking"].map((s) => isActiveCallStatus(s as never))).toEqual([true, true, true]);
    expect(["idle", "ended", "error"].map((s) => isActiveCallStatus(s as never))).toEqual([false, false, false]);
  });

  it("formats now in Eastern time", () => {
    expect(nowEastern(new Date("2026-09-02T19:04:00Z"))).toBe("Wed, Sep 2, 2026, 3:04 PM EDT");
  });
});
