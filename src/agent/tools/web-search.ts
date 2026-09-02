// Owned by W1-E. `web_search`: Tavily REST search for questions outside our data.
import { z } from "zod";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { TtlCache } from "@/lib/cache";
import { fetchJsonWithTimeout, HttpStatusError, HttpTimeoutError } from "@/agent/tools/web-http";

export const TAVILY_URL = "https://api.tavily.com/search";
export const SEARCH_TIMEOUT_MS = 4_000;
export const SEARCH_CACHE_TTL_MS = 10 * 60_000;

export type WebSearchResult = {
  results: Array<{ title: string; url: string; snippet: string }>;
  answer?: string;
  speech_hint: string;
};

/** 10-minute cache keyed by normalized query + max_results. Exported for tests. */
export const searchCache = new TtlCache<WebSearchResult>(SEARCH_CACHE_TTL_MS);

const tavilyResponse = z.object({
  answer: z.string().nullable().optional(),
  results: z
    .array(
      z.object({
        title: z.string().default(""),
        url: z.string().default(""),
        content: z.string().default(""),
      }),
    )
    .default([]),
});

const input = z.object({
  query: z
    .string()
    .min(1)
    .max(400)
    .describe("What to search for, phrased like a search query (e.g. 'Carrier 24ACC6 warranty period')."),
  max_results: z.number().int().min(1).max(10).optional().describe("How many results to return (default 3)."),
});

export function searchCacheKey(query: string, maxResults: number): string {
  return `${query.trim().toLowerCase().replace(/\s+/g, " ")}|${maxResults}`;
}

/**
 * Collapse whitespace and cut to the first sentence, capped for speech.
 * Never returns an empty string when given non-blank text.
 */
export function toSpokenSentence(text: string, maxChars = 240): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const m = /^(.+?[.!?])(?:\s+(?=[A-Z0-9"'(])|$)/.exec(flat);
  let sentence = m ? m[1] : flat;
  if (sentence.length > maxChars) {
    const cut = sentence.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    sentence = (lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, "") + ".";
  }
  return sentence;
}

async function fetchTavily(query: string, maxResults: number): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new ToolError(
      "upstream",
      "TAVILY_API_KEY is not configured",
      "Web search isn't available right now, but I can take a note and have the office look into it.",
    );
  }

  let raw: unknown;
  try {
    raw = await fetchJsonWithTimeout(
      TAVILY_URL,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          search_depth: "basic",
          include_answer: "basic",
          max_results: maxResults,
        }),
      },
      SEARCH_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof HttpTimeoutError) {
      throw new ToolError(
        "upstream",
        `web search timed out after ${SEARCH_TIMEOUT_MS} ms`,
        "The web search is taking too long right now. I can try again in a moment or have the office follow up.",
        { timeout_ms: SEARCH_TIMEOUT_MS },
      );
    }
    const status = err instanceof HttpStatusError ? err.status : undefined;
    throw new ToolError(
      "upstream",
      status ? `tavily responded with HTTP ${status}` : "could not reach tavily",
      "I couldn't reach the web search service just now. I can take a note and have the office follow up.",
      status ? { status } : undefined,
    );
  }

  const parsed = tavilyResponse.safeParse(raw);
  if (!parsed.success) {
    throw new ToolError(
      "upstream",
      "unexpected response shape from tavily",
      "The web search came back garbled. I can take a note and have the office follow up.",
    );
  }

  const results = parsed.data.results.slice(0, maxResults).map((r) => ({
    title: r.title.trim(),
    url: r.url,
    snippet: r.content.replace(/\s+/g, " ").trim(),
  }));
  const answer = parsed.data.answer?.trim() || undefined;

  let speech_hint: string;
  if (answer) speech_hint = toSpokenSentence(answer);
  else if (results[0]?.snippet) speech_hint = toSpokenSentence(results[0].snippet);
  else speech_hint = "I couldn't find anything on that. Want me to note it for the office?";

  return answer ? { results, answer, speech_hint } : { results, speech_hint };
}

export const webSearch = defineTool({
  description:
    "Search the public web for things that are not in our own records: part or model info, manufacturer warranty terms, permit or code rules, directions, another business's hours or phone number. " +
    "Returns a short answer when one is available plus up to max_results links with snippets. " +
    "Do not use it for our customers, jobs, prices, or schedule; those come from our other tools.",
  input,
  handler: async (args): Promise<WebSearchResult> => {
    const query = args.query.replace(/\s+/g, " ").trim();
    if (!query) {
      throw new ToolError("validation", "query is blank", "What would you like me to look up?");
    }
    const maxResults = args.max_results ?? 3;
    return searchCache.getOrSet(searchCacheKey(query, maxResults), () => fetchTavily(query, maxResults));
  },
});
