import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolError } from "@/agent/errors";
import type { ToolContext } from "@/agent/registry";
import { webSearch, searchCache, searchCacheKey, toSpokenSentence, TAVILY_URL } from "@/agent/tools/web-search";

const ctx: ToolContext = { callId: null, actor: "office", actorId: null };
const run = (input: { query: string; max_results?: number }) => webSearch.handler(webSearch.input.parse(input), ctx);

const tavilyBody = {
  query: "carrier 24acc6 warranty",
  answer:
    "Carrier's 24ACC6 carries a 10-year parts limited warranty when registered within 90 days. Unregistered units get 5 years. Labor is not included.",
  results: [
    {
      title: "Carrier 24ACC6 Warranty",
      url: "https://example.com/carrier",
      content: "The 24ACC6 has a 10-year parts warranty if registered.  Labor coverage is dealer specific.\nMore text.",
      score: 0.9,
    },
    { title: "Second", url: "https://example.com/2", content: "Second snippet.", score: 0.5 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  searchCache.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TAVILY_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("toSpokenSentence", () => {
  it("returns the first sentence, whitespace collapsed", () => {
    expect(toSpokenSentence("First  one.\nSecond one. Third.")).toBe("First one.");
    expect(toSpokenSentence("No terminal punctuation here")).toBe("No terminal punctuation here");
    expect(toSpokenSentence("Is it? Yes.")).toBe("Is it?");
  });
  it("caps very long sentences at a word boundary", () => {
    const long = "word ".repeat(100).trim() + ".";
    const out = toSpokenSentence(long, 60);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out.endsWith(".")).toBe(true);
    expect(out).not.toContain("wor.");
  });
});

describe("web_search", () => {
  it("calls Tavily with the contract body and returns results + answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(tavilyBody));
    const out = await run({ query: "carrier 24acc6 warranty" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TAVILY_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "carrier 24acc6 warranty",
      search_depth: "basic",
      include_answer: "basic",
      max_results: 3,
    });

    expect(out.results).toEqual([
      {
        title: "Carrier 24ACC6 Warranty",
        url: "https://example.com/carrier",
        snippet: "The 24ACC6 has a 10-year parts warranty if registered. Labor coverage is dealer specific. More text.",
      },
      { title: "Second", url: "https://example.com/2", snippet: "Second snippet." },
    ]);
    expect(out.answer).toBe(tavilyBody.answer);
    expect(out.speech_hint).toBe("Carrier's 24ACC6 carries a 10-year parts limited warranty when registered within 90 days.");
  });

  it("falls back to the first snippet's first sentence when there is no answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...tavilyBody, answer: null }));
    const out = await run({ query: "carrier 24acc6 warranty" });
    expect(out.answer).toBeUndefined();
    expect(out.speech_hint).toBe("The 24ACC6 has a 10-year parts warranty if registered.");
  });

  it("speaks gracefully when nothing comes back", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));
    const out = await run({ query: "zzzz qqqq" });
    expect(out.results).toEqual([]);
    expect(out.speech_hint).toMatch(/couldn't find anything/i);
  });

  it("respects max_results and passes it upstream", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(tavilyBody));
    const out = await run({ query: "carrier", max_results: 1 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).max_results).toBe(1);
    expect(out.results).toHaveLength(1);
  });

  it("serves repeats from the 10-minute cache in under 5 ms", async () => {
    fetchMock.mockResolvedValue(jsonResponse(tavilyBody));
    await run({ query: "Carrier 24ACC6  warranty" });
    const t0 = performance.now();
    const out = await run({ query: "  carrier 24acc6 warranty " });
    const ms = performance.now() - t0;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.answer).toBe(tavilyBody.answer);
    expect(ms).toBeLessThan(5);
    expect(searchCacheKey(" Carrier  24ACC6 ", 3)).toBe("carrier 24acc6|3");
    expect(searchCacheKey("carrier 24acc6", 5)).not.toBe(searchCacheKey("carrier 24acc6", 3));
  });

  it("aborts after 4 s and reports an upstream error", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const p = run({ query: "slow query" });
    const assertion = expect(p).rejects.toMatchObject({ code: "upstream", details: { timeout_ms: 4000 } });
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).speechHint).toMatch(/taking too long/i);
  });

  it("maps a non-2xx from Tavily to code upstream with the status in details", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 502));
    const err = await run({ query: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe("upstream");
    expect((err as ToolError).details).toEqual({ status: 502 });
    expect((err as ToolError).speechHint).toMatch(/couldn't reach/i);
  });

  it("maps a network failure to code upstream and does not cache it", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(tavilyBody));
    await expect(run({ query: "x" })).rejects.toMatchObject({ code: "upstream" });
    await expect(run({ query: "x" })).resolves.toMatchObject({ answer: tavilyBody.answer });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports upstream when the API key is missing, without calling out", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    await expect(run({ query: "x" })).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty query at the schema", () => {
    expect(webSearch.input.safeParse({ query: "" }).success).toBe(false);
    expect(webSearch.input.safeParse({ query: "ok", max_results: 0 }).success).toBe(false);
  });
});
