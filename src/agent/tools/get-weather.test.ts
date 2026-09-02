import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolError } from "@/agent/errors";
import type { ToolContext } from "@/agent/registry";
import {
  getWeather,
  geocodeCache,
  weatherCache,
  weatherDeps,
  biasLocationQuery,
  parseWhen,
  weatherCodeLabel,
  buildWeatherResult,
  type ForecastPayload,
} from "@/agent/tools/get-weather";

const ctx: ToolContext = { callId: null, actor: "office", actorId: null };
type Input = { location?: string; lat?: number; lng?: number; when?: string };
const run = (input: Input = {}) => getWeather.handler(getWeather.input.parse(input), ctx);

/** Wed Sep 2 2026, 2:30 PM EDT. */
const NOW = new Date("2026-09-02T18:30:00Z");

function buildPayload(): ForecastPayload {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const precipitation_probability: number[] = [];
  const weather_code: number[] = [];
  for (const day of ["2026-09-02", "2026-09-03"]) {
    for (let h = 0; h < 24; h++) {
      time.push(`${day}T${String(h).padStart(2, "0")}:00`);
      temperature_2m.push(80 + (h >= 11 && h <= 17 ? 11 : h >= 8 && h <= 20 ? 6 : 0));
      if (day === "2026-09-02" && h >= 15 && h <= 17) {
        precipitation_probability.push(60);
        weather_code.push(95);
      } else if (day === "2026-09-03" && h === 14) {
        precipitation_probability.push(40);
        weather_code.push(80);
      } else {
        precipitation_probability.push(day === "2026-09-02" ? 10 : 5);
        weather_code.push(day === "2026-09-02" ? 2 : 1);
      }
    }
  }
  return {
    current: { time: "2026-09-02T14:15", temperature_2m: 91.2, apparent_temperature: 101.3, relative_humidity_2m: 74, weather_code: 2 },
    hourly: { time, temperature_2m, precipitation_probability, weather_code },
  };
}

const geocodeBody = {
  results: [{ name: "Homestead", latitude: 25.4687, longitude: -80.4776, admin1: "Florida", country: "United States", country_code: "US" }],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();
const calledUrls = () => fetchMock.mock.calls.map((c) => String(c[0]));

function routeFetch(overrides: { geocode?: () => Response | Promise<Response>; forecast?: () => Response | Promise<Response> } = {}) {
  fetchMock.mockImplementation(async (url) => {
    const u = String(url);
    if (u.startsWith("https://geocoding-api.open-meteo.com/")) return overrides.geocode ? overrides.geocode() : jsonResponse(geocodeBody);
    if (u.startsWith("https://api.open-meteo.com/v1/forecast")) return overrides.forecast ? overrides.forecast() : jsonResponse(buildPayload());
    throw new Error(`unexpected url ${u}`);
  });
}

beforeEach(() => {
  geocodeCache.clear();
  weatherCache.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  weatherDeps.now = () => NOW;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  weatherDeps.now = () => new Date();
});

describe("helpers", () => {
  it("biases bare place names toward Florida and leaves the rest alone", () => {
    expect(biasLocationQuery("Homestead")).toBe("Homestead, Florida");
    expect(biasLocationQuery("  Coral   Gables ")).toBe("Coral Gables, Florida");
    expect(biasLocationQuery("Homestead, FL")).toBe("Homestead, FL");
    expect(biasLocationQuery("Atlanta, GA")).toBe("Atlanta, GA");
    expect(biasLocationQuery("Atlanta GA")).toBe("Atlanta GA");
    expect(biasLocationQuery("Key West Florida")).toBe("Key West Florida");
    expect(biasLocationQuery("Albany New York")).toBe("Albany New York");
    expect(biasLocationQuery("33030")).toBe("33030");
  });

  it("parses when", () => {
    expect(parseWhen(undefined)).toEqual({ kind: "now" });
    expect(parseWhen(" Now ")).toEqual({ kind: "now" });
    expect(parseWhen("today")).toEqual({ kind: "today" });
    expect(parseWhen("Tomorrow")).toEqual({ kind: "tomorrow" });
    expect(parseWhen("2026-09-03T15:20:00-04:00")).toEqual({ kind: "at", at: new Date("2026-09-03T19:20:00Z") });
    expect(() => parseWhen("whenever")).toThrow(ToolError);
    expect(() => parseWhen("2026-13-45")).toThrow(ToolError);
  });

  it("maps WMO codes to plain words", () => {
    expect(weatherCodeLabel(0)).toBe("clear");
    expect(weatherCodeLabel(2)).toBe("partly cloudy");
    expect(weatherCodeLabel(63)).toBe("rain");
    expect(weatherCodeLabel(80)).toBe("light showers");
    expect(weatherCodeLabel(95)).toBe("thunderstorms");
    expect(weatherCodeLabel(999)).toBe("unsettled");
    expect(weatherCodeLabel(null)).toBe("unsettled");
  });
});

describe("get_weather", () => {
  it("now: geocodes with the Florida bias, fetches the contract forecast URL, and speaks the example line", async () => {
    routeFetch();
    const out = await run({ location: "Homestead" });

    const urls = calledUrls();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://geocoding-api.open-meteo.com/v1/search?name=Homestead%2C%20Florida&count=1&language=en&format=json");
    expect(urls[1]).toBe(
      "https://api.open-meteo.com/v1/forecast?latitude=25.4687&longitude=-80.4776" +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code" +
        "&hourly=temperature_2m,precipitation_probability,weather_code" +
        "&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=2",
    );

    expect(out.location_label).toBe("Homestead, Florida");
    expect(out.current).toEqual({ temp_f: 91, feels_like_f: 101, humidity: 74, conditions: "partly cloudy" });
    expect(out.forecast).toHaveLength(8);
    expect(out.forecast[0]).toEqual({ time_label: "2 PM", temp_f: 91, precip_prob: 10, conditions: "partly cloudy" });
    expect(out.forecast[1]).toEqual({ time_label: "3 PM", temp_f: 91, precip_prob: 60, conditions: "thunderstorms" });
    expect(out.forecast[7].time_label).toBe("9 PM");
    expect(out.speech_hint).toBe("It's 91 and humid in Homestead right now, with a 60 percent chance of storms after 3 PM.");
  });

  it("defaults to Miami, FL and leaves an explicit state alone", async () => {
    routeFetch();
    await run();
    expect(calledUrls()[0]).toContain("name=Miami%2C%20FL&count=1");
    await run({ location: "Atlanta, GA", when: "today" });
    expect(calledUrls()[2]).toContain("name=Atlanta%2C%20GA&count=1");
  });

  it("today: summarizes the next 8 hours", async () => {
    routeFetch();
    const out = await run({ location: "Homestead", when: "today" });
    expect(out.forecast.map((f) => f.time_label)).toEqual(["2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"]);
    expect(out.speech_hint).toBe(
      "Over the next eight hours in Homestead, expect 80 to 91 and partly cloudy, with a 60 percent chance of storms after 3 PM.",
    );
  });

  it("tomorrow: summarizes 8 AM to 6 PM", async () => {
    routeFetch();
    const out = await run({ location: "Homestead", when: "tomorrow" });
    expect(out.forecast).toHaveLength(11);
    expect(out.forecast[0].time_label).toBe("Tomorrow 8 AM");
    expect(out.forecast[10].time_label).toBe("Tomorrow 6 PM");
    expect(out.forecast[6]).toEqual({ time_label: "Tomorrow 2 PM", temp_f: 91, precip_prob: 40, conditions: "light showers" });
    expect(out.speech_hint).toBe("Tomorrow in Homestead looks like 86 to 91 and mostly clear, with a 40 percent chance of rain after 2 PM.");
  });

  it("ISO when: picks the nearest hour", async () => {
    routeFetch();
    const out = await run({ location: "Homestead", when: "2026-09-03T14:20:00-04:00" });
    expect(out.forecast).toEqual([{ time_label: "Tomorrow 2 PM", temp_f: 91, precip_prob: 40, conditions: "light showers" }]);
    expect(out.speech_hint).toBe("Around 2 PM tomorrow in Homestead, expect 91 and light showers with a 40 percent chance of rain.");

    const today = await run({ location: "Homestead", when: "2026-09-02T20:40:00Z" });
    expect(today.forecast[0].time_label).toBe("5 PM");
    expect(today.speech_hint).toMatch(/^Around 5 PM today in Homestead, expect 91 and thunderstorms with a 60 percent chance of storms\.$/);
  });

  it("rejects an unparseable or out-of-range when", async () => {
    routeFetch();
    await expect(run({ when: "whenever" })).rejects.toMatchObject({ code: "validation" });
    await expect(run({ location: "Homestead", when: "2026-09-10T12:00:00Z" })).rejects.toMatchObject({ code: "validation" });
  });

  it("uses lat/lng directly and skips geocoding", async () => {
    routeFetch();
    const out = await run({ lat: 25.4687, lng: -80.4776, location: "Homestead, FL" });
    expect(calledUrls()).toHaveLength(1);
    expect(calledUrls()[0]).toContain("latitude=25.4687&longitude=-80.4776");
    expect(out.location_label).toBe("Homestead, FL");
    expect(out.speech_hint).toContain("in Homestead right now");
    await expect(run({ lat: 25.4 })).rejects.toMatchObject({ code: "validation" });
  });

  it("retries without the Florida bias, then reports not_found", async () => {
    let n = 0;
    routeFetch({ geocode: () => jsonResponse(++n === 1 ? {} : geocodeBody) });
    await run({ location: "Atlanta" });
    expect(calledUrls()[0]).toContain("name=Atlanta%2C%20Florida");
    expect(calledUrls()[1]).toContain("name=Atlanta&count=1");

    geocodeCache.clear();
    routeFetch({ geocode: () => jsonResponse({}) });
    const err = await run({ location: "Nowhereville" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe("not_found");
    expect((err as ToolError).speechHint).toMatch(/couldn't find a place called Nowhereville/);
  });

  it("serves repeats from the 15-minute cache in under 5 ms, for any `when`", async () => {
    routeFetch();
    await run({ location: "Homestead" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const t0 = performance.now();
    const out = await run({ location: "Homestead", when: "tomorrow" });
    const ms = performance.now() - t0;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.forecast[0].time_label).toBe("Tomorrow 8 AM");
    expect(ms).toBeLessThan(5);
  });

  it("aborts after 4 s and reports an upstream error naming the stage", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const p = run({ location: "Homestead" });
    const assertion = expect(p).rejects.toMatchObject({ code: "upstream", details: { timeout_ms: 4000, stage: "geocoding" } });
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
  });

  it("maps upstream HTTP failures and garbled bodies to code upstream", async () => {
    routeFetch({ forecast: () => jsonResponse({ reason: "down" }, 503) });
    const err = await run({ location: "Homestead" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe("upstream");
    expect((err as ToolError).details).toEqual({ stage: "forecast", status: 503 });

    weatherCache.clear();
    routeFetch({ forecast: () => jsonResponse({ hourly: {} }) });
    await expect(run({ location: "Homestead" })).rejects.toMatchObject({ code: "upstream", details: { stage: "forecast" } });
    expect(weatherCache.size).toBe(0);
  });
});

describe("buildWeatherResult (pure)", () => {
  it("speaks the sky condition when it is dry and not humid", () => {
    const payload = buildPayload();
    payload.current.relative_humidity_2m = 55;
    payload.hourly.precipitation_probability = payload.hourly.precipitation_probability.map(() => 5);
    payload.hourly.weather_code = payload.hourly.weather_code.map(() => 0);
    const out = buildWeatherResult(payload, { name: "Miami", label: "Miami, Florida" }, { kind: "now" }, NOW);
    expect(out.speech_hint).toBe("It's 91 and partly cloudy in Miami right now.");
  });

  it("names the rain kind when it dominates the window", () => {
    const payload = buildPayload();
    payload.current.weather_code = 63;
    payload.hourly.weather_code = payload.hourly.weather_code.map(() => 63);
    payload.hourly.precipitation_probability = payload.hourly.precipitation_probability.map(() => 80);
    const out = buildWeatherResult(payload, { name: "Miami", label: "Miami, Florida" }, { kind: "today" }, NOW);
    expect(out.speech_hint).toBe("Over the next eight hours in Miami, expect 80 to 91 and rain, with an 80 percent chance of rain.");
    const now = buildWeatherResult(payload, { name: "Miami", label: "Miami, Florida" }, { kind: "now" }, NOW);
    expect(now.speech_hint).toBe("It's 91 and rain in Miami right now, with an 80 percent chance of rain.");
  });
});
