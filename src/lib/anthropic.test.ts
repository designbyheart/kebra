import { describe, expect, it } from "vitest";
import { addUsage, classifyResult, costCents, costUsd, ZERO_USAGE, type BatchResult } from "./anthropic";

describe("cost math", () => {
  it("prices input at $5/M and output at $25/M, half price in batch", () => {
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(5);
    expect(costUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(25);
    expect(costUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, { batch: true })).toBe(15);
    expect(costCents({ input_tokens: 1_000_000, output_tokens: 0 }, { batch: true })).toBe(250);
    expect(costCents({ input_tokens: 0, output_tokens: 1_000_000 }, { batch: true })).toBe(1250);
  });

  it("prices cache writes at 1.25x and cache reads at 0.1x of input", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    };
    expect(costUsd(usage)).toBeCloseTo(6.25 + 0.5, 6);
  });

  it("rounds to whole cents once, on the summed usage", () => {
    // 2,123 requests x ~900 input tokens, 2,123 x ~350 output tokens (batch)
    const usage = { input_tokens: 1_910_700, output_tokens: 743_050 };
    // (1.9107 * 5 + 0.74305 * 25) / 2 = (9.5535 + 18.57625) / 2 = 14.064875
    expect(costCents(usage, { batch: true })).toBe(1406);
    expect(addUsage(ZERO_USAGE, usage)).toMatchObject(usage);
  });
});

function succeeded(text: string, stop_reason = "end_turn"): BatchResult {
  return {
    custom_id: "addr-x",
    result: {
      type: "succeeded",
      message: {
        id: "msg",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "text", text, citations: null }],
        stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  } as unknown as BatchResult;
}

describe("classifyResult", () => {
  it("parses JSON text from succeeded results", () => {
    const out = classifyResult(succeeded('{"a":1}'));
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.json).toEqual({ a: 1 });
  });

  it("flags refusals and truncation instead of parsing", () => {
    expect(classifyResult(succeeded("", "refusal")).kind).toBe("refusal");
    expect(classifyResult(succeeded('{"a":', "max_tokens")).kind).toBe("truncated");
  });

  it("reports malformed JSON and errored/expired results", () => {
    expect(classifyResult(succeeded("not json")).kind).toBe("bad_json");
    const errored = {
      custom_id: "x",
      result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "bad" } } },
    } as unknown as BatchResult;
    expect(classifyResult(errored).kind).toBe("errored");
    const expired = { custom_id: "x", result: { type: "expired" } } as unknown as BatchResult;
    expect(classifyResult(expired).kind).toBe("expired");
  });
});
