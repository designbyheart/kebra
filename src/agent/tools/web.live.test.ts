// Live smoke test for the web tools. Skipped unless RUN_LIVE=1. Needs TAVILY_API_KEY in .env.
import "dotenv/config";
import { describe, it, expect } from "vitest";
import type { ToolContext } from "@/agent/registry";
import { webSearch, searchCache } from "@/agent/tools/web-search";
import { getWeather, weatherCache, geocodeCache } from "@/agent/tools/get-weather";

const ctx: ToolContext = { callId: null, actor: "office", actorId: null };
const live = process.env.RUN_LIVE === "1";

describe.skipIf(!live)("web tools (live)", () => {
  it("web_search answers a real query and caches it", async () => {
    searchCache.clear();
    const input = webSearch.input.parse({ query: "Miami-Dade County HVAC permit requirements", max_results: 3 });
    const t0 = performance.now();
    const out = await webSearch.handler(input, ctx);
    const missMs = performance.now() - t0;
    const t1 = performance.now();
    await webSearch.handler(input, ctx);
    const hitMs = performance.now() - t1;
    console.log(`[live] web_search miss=${missMs.toFixed(0)}ms hit=${hitMs.toFixed(2)}ms speech_hint="${out.speech_hint}"`);

    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0].url).toMatch(/^https?:\/\//);
    expect(out.speech_hint.length).toBeGreaterThan(10);
    expect(missMs).toBeLessThan(4500);
    expect(hitMs).toBeLessThan(5);
  }, 15_000);

  it("get_weather reports Homestead and caches it", async () => {
    weatherCache.clear();
    geocodeCache.clear();
    const input = getWeather.input.parse({ location: "Homestead", when: "now" });
    const t0 = performance.now();
    const out = await getWeather.handler(input, ctx);
    const missMs = performance.now() - t0;
    const t1 = performance.now();
    await getWeather.handler(getWeather.input.parse({ location: "Homestead", when: "tomorrow" }), ctx);
    const hitMs = performance.now() - t1;
    console.log(`[live] get_weather miss=${missMs.toFixed(0)}ms hit=${hitMs.toFixed(2)}ms speech_hint="${out.speech_hint}"`);

    expect(out.location_label).toBe("Homestead, Florida");
    expect(out.current.temp_f).toBeGreaterThan(30);
    expect(out.current.temp_f).toBeLessThan(120);
    expect(out.forecast.length).toBeGreaterThan(0);
    expect(out.speech_hint).toMatch(/^It's \d+ and .+ in Homestead right now/);
    expect(missMs).toBeLessThan(4500);
    expect(hitMs).toBeLessThan(5);
  }, 15_000);
});
