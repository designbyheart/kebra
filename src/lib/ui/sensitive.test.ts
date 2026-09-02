import { describe, expect, it } from "vitest";
import { hasSensitive, splitSensitive } from "./sensitive";

describe("splitSensitive", () => {
  it("masks the digits of a gate code but keeps the label visible", () => {
    const segs = splitSensitive("Gate code is 4521, park by the pool.");
    expect(segs.filter((s) => s.sensitive).map((s) => s.text)).toEqual(["4521"]);
    expect(segs.map((s) => s.text).join("")).toBe("Gate code is 4521, park by the pool.");
    expect(segs[0]).toEqual({ text: "Gate code is ", sensitive: false });
  });

  it("masks lockbox and phone numbers", () => {
    const segs = splitSensitive("Lockbox #0987 on the side door. Call 305-555-0123 on arrival.");
    expect(segs.filter((s) => s.sensitive).map((s) => s.text)).toEqual(["0987", "305-555-0123"]);
  });

  it("leaves already-redacted import text and plain numbers alone", () => {
    expect(hasSensitive("Door code: [code]. Replaced 2 capacitors, 45/5 MFD.")).toBe(false);
    expect(hasSensitive("Unit 36W, invoice 5197, $267 due")).toBe(false);
    expect(splitSensitive("nothing here")).toEqual([{ text: "nothing here", sensitive: false }]);
  });
});
