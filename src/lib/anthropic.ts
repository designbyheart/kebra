/**
 * Anthropic client, Message Batches helpers and cost math shared by
 * scripts/dossiers.ts (W1-D). Model and pricing are pinned here so the numbers
 * in receipts/claude-dossiers.md are reproducible from usage counts.
 */
import Anthropic from "@anthropic-ai/sdk";

export const DOSSIER_MODEL = "claude-opus-5";

/** USD per million tokens for Claude Opus 5 on the first-party API (Sept 2026). */
export const PRICING = {
  inputPerMTok: 5,
  outputPerMTok: 25,
  cacheWriteMultiplier: 1.25,
  cacheReadMultiplier: 0.1,
  /** Message Batches API bills every token at half price. */
  batchDiscount: 0.5,
} as const;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export const ZERO_USAGE: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  };
}

/** Dollar cost of a usage block. `input_tokens` is the uncached portion (API semantics). */
export function costUsd(usage: TokenUsage, opts: { batch?: boolean } = {}): number {
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const inputEquivalent =
    usage.input_tokens + write * PRICING.cacheWriteMultiplier + read * PRICING.cacheReadMultiplier;
  const usd =
    (inputEquivalent / 1_000_000) * PRICING.inputPerMTok +
    (usage.output_tokens / 1_000_000) * PRICING.outputPerMTok;
  return opts.batch ? usd * PRICING.batchDiscount : usd;
}

/** Whole cents, rounded half up. Sum usage first, then round once. */
export function costCents(usage: TokenUsage, opts: { batch?: boolean } = {}): number {
  return Math.round(costUsd(usage, opts) * 100);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let cached: Anthropic | undefined;

/** Credentials resolve from ANTHROPIC_API_KEY (or an `ant auth login` profile). */
export function getAnthropic(): Anthropic {
  if (!cached) cached = new Anthropic({ maxRetries: 4 });
  return cached;
}

// ---------------------------------------------------------------------------
// Message Batches
// ---------------------------------------------------------------------------

export type BatchRequest = Anthropic.Messages.BatchCreateParams.Request;
export type BatchResult = Anthropic.Messages.MessageBatchIndividualResponse;
export type MessageBatch = Anthropic.Messages.MessageBatch;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function submitBatch(client: Anthropic, requests: BatchRequest[]): Promise<MessageBatch> {
  return client.messages.batches.create({ requests });
}

/** Poll until `processing_status === "ended"`. */
export async function waitForBatch(
  client: Anthropic,
  batchId: string,
  opts: { intervalMs?: number; onPoll?: (b: MessageBatch) => void } = {},
): Promise<MessageBatch> {
  const intervalMs = opts.intervalMs ?? 90_000;
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    opts.onPoll?.(batch);
    if (batch.processing_status === "ended") return batch;
    await sleep(intervalMs);
  }
}

/** Results arrive in any order; consumers must key by `custom_id`. */
export async function* iterateBatchResults(client: Anthropic, batchId: string): AsyncGenerator<BatchResult> {
  const decoder = await client.messages.batches.results(batchId);
  for await (const result of decoder) yield result;
}

export type BatchOutcome =
  | { kind: "ok"; message: Anthropic.Message; json: unknown }
  | { kind: "refusal"; message: Anthropic.Message }
  | { kind: "truncated"; message: Anthropic.Message }
  | { kind: "bad_json"; message: Anthropic.Message; error: string }
  | { kind: "errored"; error: string }
  | { kind: "canceled" }
  | { kind: "expired" };

/** Classify one batch result; `stop_reason === "refusal"` is treated as an error. */
export function classifyResult(result: BatchResult): BatchOutcome {
  const r = result.result;
  switch (r.type) {
    case "succeeded": {
      const message = r.message;
      if (message.stop_reason === "refusal") return { kind: "refusal", message };
      if (message.stop_reason === "max_tokens") return { kind: "truncated", message };
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      try {
        return { kind: "ok", message, json: JSON.parse(text) };
      } catch (e) {
        return { kind: "bad_json", message, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "errored":
      return { kind: "errored", error: JSON.stringify(r.error) };
    case "canceled":
      return { kind: "canceled" };
    case "expired":
      return { kind: "expired" };
  }
}

export function usageOf(message: Anthropic.Message): TokenUsage {
  return {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens,
  };
}
