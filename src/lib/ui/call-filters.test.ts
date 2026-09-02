import { describe, expect, it } from "vitest";
import { CALL_FILTER_CHIPS, callsHref } from "./call-filters";

describe("callsHref", () => {
  it("omits the default filter and empty query", () => {
    expect(callsHref("all", "")).toBe("/calls");
  });
  it("keeps filter and query", () => {
    expect(callsHref("live", "")).toBe("/calls?f=live");
    expect(callsHref("all", "frozen")).toBe("/calls?q=frozen");
    expect(callsHref("review", "a b")).toBe("/calls?f=review&q=a+b");
  });
});

describe("CALL_FILTER_CHIPS", () => {
  it("lists every filter once, All first without a count", () => {
    expect(CALL_FILTER_CHIPS.map((c) => c.key)).toEqual(["all", "live", "today", "review", "handoffs"]);
    expect(CALL_FILTER_CHIPS[0].count).toBeUndefined();
  });
});
