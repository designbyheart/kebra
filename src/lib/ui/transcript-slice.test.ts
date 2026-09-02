import { describe, expect, it } from "vitest";
import type { TranscriptTurn } from "@/db/schema";
import { excerptEmptyMessage, formatExcerptOffset, sliceTranscript } from "./transcript-slice";

const turns: TranscriptTurn[] = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 === 0 ? "assistant" : "user",
  text: `turn ${i}`,
  t: i * 5,
}));

describe("sliceTranscript", () => {
  it("takes [from - before, to + after) and highlights from `from`", () => {
    const lines = sliceTranscript(turns, { from: 12, to: 12 });
    expect(lines.map((l) => l.index)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(lines.filter((l) => l.highlight).map((l) => l.index)).toEqual([12, 13, 14, 15]);
    expect(lines[0].role).toBe("assistant");
    expect(lines[0].text).toBe("turn 6");
  });

  it("clamps at both ends", () => {
    expect(sliceTranscript(turns, { from: 2, to: 2 }).map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sliceTranscript(turns, { from: 19, to: 19 }).map((l) => l.index)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    // ref at the very end (request was the last thing said): only context before it
    expect(sliceTranscript(turns, { from: 20, to: 20 }).map((l) => l.index)).toEqual([14, 15, 16, 17, 18, 19]);
  });

  it("honours a wider ref range and custom context sizes", () => {
    const lines = sliceTranscript(turns, { from: 5, to: 8 }, 1, 1);
    expect(lines.map((l) => l.index)).toEqual([4, 5, 6, 7, 8]);
    expect(lines.map((l) => l.highlight)).toEqual([false, true, true, true, true]);
  });

  it("returns nothing without a transcript or a ref", () => {
    expect(sliceTranscript([], { from: 0, to: 0 })).toEqual([]);
    expect(sliceTranscript(null, { from: 0, to: 0 })).toEqual([]);
    expect(sliceTranscript(turns, null)).toEqual([]);
  });

  it("skips malformed turns and tolerates a `to` before `from`", () => {
    const messy = [...turns.slice(0, 3), { role: "user", text: 42 } as unknown as TranscriptTurn, ...turns.slice(4, 6)];
    const lines = sliceTranscript(messy, { from: 4, to: 1 }, 6, 4);
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2, 4, 5]);
  });
});

describe("formatExcerptOffset / excerptEmptyMessage", () => {
  it("formats seconds as m:ss and blanks bad input", () => {
    expect(formatExcerptOffset(0)).toBe("0:00");
    expect(formatExcerptOffset(65.9)).toBe("1:05");
    expect(formatExcerptOffset(-1)).toBe("");
    expect(formatExcerptOffset(Number.NaN)).toBe("");
  });
  it("falls back to a wall-clock time for epoch millis", () => {
    expect(formatExcerptOffset(Date.UTC(2026, 8, 2, 16, 0, 0))).toMatch(/\d/);
  });
  it("explains an empty passage", () => {
    expect(excerptEmptyMessage(12)).toBe("No transcript reference was recorded for this request.");
    expect(excerptEmptyMessage(0)).toBe("Transcript not available yet.");
  });
});
