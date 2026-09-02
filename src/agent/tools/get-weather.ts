// Owned by W1-E. `get_weather`: Open-Meteo geocoding + forecast, spoken in plain words.
import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { defineTool } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { TtlCache } from "@/lib/cache";
import { BUSINESS_TZ, formatDayET, isoDateET } from "@/lib/time";
import { fetchJsonWithTimeout, HttpStatusError, HttpTimeoutError } from "@/agent/tools/web-http";

export const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const WEATHER_TIMEOUT_MS = 4_000;
export const WEATHER_CACHE_TTL_MS = 15 * 60_000;
export const DEFAULT_LOCATION = "Miami, FL";

const HOUR_MS = 60 * 60_000;

export type GeoPoint = { lat: number; lng: number; name: string; label: string };

export type ForecastPayload = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: Array<number | null>;
    precipitation_probability: Array<number | null>;
    weather_code: Array<number | null>;
  };
};

export type WeatherResult = {
  location_label: string;
  current: { temp_f: number; feels_like_f: number; humidity: number; conditions: string };
  forecast: Array<{ time_label: string; temp_f: number; precip_prob: number; conditions: string }>;
  speech_hint: string;
};

export type WhenSpec = { kind: "now" | "today" | "tomorrow" } | { kind: "at"; at: Date };

/** 15-minute caches, exported for tests. */
export const geocodeCache = new TtlCache<GeoPoint>(WEATHER_CACHE_TTL_MS);
export const weatherCache = new TtlCache<ForecastPayload>(WEATHER_CACHE_TTL_MS);

/** Injectable clock so tests can pin "now". */
export const weatherDeps = { now: (): Date => new Date() };

const input = z.object({
  location: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("City, ZIP, or address label such as 'Homestead, FL'. Defaults to Miami, FL. Florida is assumed when no state is given."),
  lat: z.number().min(-90).max(90).optional().describe("Latitude, if already known (use with lng)."),
  lng: z.number().min(-180).max(180).optional().describe("Longitude, if already known (use with lat)."),
  when: z
    .string()
    .max(40)
    .optional()
    .describe("'now' (default), 'today' (next 8 hours), 'tomorrow' (8 AM to 6 PM), or an ISO-8601 date-time for a specific hour."),
});

const geocodeResponse = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        country: z.string().optional(),
        country_code: z.string().optional(),
      }),
    )
    .optional(),
});

const forecastResponse = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});

// ---------------------------------------------------------------------------
// Weather codes (WMO 4677 as used by Open-Meteo) → plain words.

type CodeGroup = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";

const WMO: Record<number, { label: string; group: CodeGroup }> = {
  0: { label: "clear", group: "clear" },
  1: { label: "mostly clear", group: "clear" },
  2: { label: "partly cloudy", group: "cloudy" },
  3: { label: "overcast", group: "cloudy" },
  45: { label: "foggy", group: "fog" },
  48: { label: "foggy", group: "fog" },
  51: { label: "light drizzle", group: "rain" },
  53: { label: "drizzle", group: "rain" },
  55: { label: "heavy drizzle", group: "rain" },
  56: { label: "freezing drizzle", group: "rain" },
  57: { label: "freezing drizzle", group: "rain" },
  61: { label: "light rain", group: "rain" },
  63: { label: "rain", group: "rain" },
  65: { label: "heavy rain", group: "rain" },
  66: { label: "freezing rain", group: "rain" },
  67: { label: "freezing rain", group: "rain" },
  71: { label: "light snow", group: "snow" },
  73: { label: "snow", group: "snow" },
  75: { label: "heavy snow", group: "snow" },
  77: { label: "snow grains", group: "snow" },
  80: { label: "light showers", group: "rain" },
  81: { label: "showers", group: "rain" },
  82: { label: "heavy showers", group: "rain" },
  85: { label: "snow showers", group: "snow" },
  86: { label: "heavy snow showers", group: "snow" },
  95: { label: "thunderstorms", group: "storm" },
  96: { label: "thunderstorms with hail", group: "storm" },
  99: { label: "thunderstorms with hail", group: "storm" },
};

export function weatherCodeLabel(code: number | null | undefined): string {
  return (code != null && WMO[code]?.label) || "unsettled";
}

function codeGroup(code: number | null | undefined): CodeGroup {
  return (code != null && WMO[code]?.group) || "cloudy";
}

// ---------------------------------------------------------------------------
// Location handling

const US_STATES = new Set(
  (
    "AL Alabama AK Alaska AZ Arizona AR Arkansas CA California CO Colorado CT Connecticut DE Delaware FL Florida GA Georgia " +
    "HI Hawaii ID Idaho IL Illinois IN Indiana IA Iowa KS Kansas KY Kentucky LA Louisiana ME Maine MD Maryland MA Massachusetts " +
    "MI Michigan MN Minnesota MS Mississippi MO Missouri MT Montana NE Nebraska NV Nevada NH NJ NM NY NC ND OH Ohio OK Oklahoma " +
    "OR Oregon PA Pennsylvania RI SC SD TN Tennessee TX Texas UT Utah VT Vermont VA Virginia WA Washington WV WI Wisconsin WY Wyoming DC"
  )
    .split(" ")
    .map((s) => s.toLowerCase()),
);
const MULTI_WORD_STATES = /\b(new hampshire|new jersey|new mexico|new york|north carolina|north dakota|rhode island|south carolina|south dakota|west virginia)$/i;

/**
 * Bias bare place names toward Florida (the business's service area):
 * "Homestead" → "Homestead, Florida"; "Homestead, FL", "Atlanta, GA", "33030"
 * and anything already carrying a state or comma are left alone.
 */
export function biasLocationQuery(location: string): string {
  const q = location.replace(/\s+/g, " ").trim();
  if (!q || q.includes(",") || /^\d{5}(-\d{4})?$/.test(q) || MULTI_WORD_STATES.test(q)) return q;
  const last = q.split(" ").pop()!.toLowerCase();
  if (US_STATES.has(last) && q.split(" ").length > 1) return q;
  return `${q}, Florida`;
}

async function geocode(location: string): Promise<GeoPoint> {
  const biased = biasLocationQuery(location);
  const key = biased.toLowerCase();
  return geocodeCache.getOrSet(key, async () => {
    const first = await geocodeOnce(biased);
    if (first) return first;
    // The Florida bias can hide real places elsewhere ("Atlanta"); retry unbiased.
    const raw = location.replace(/\s+/g, " ").trim();
    const second = raw.toLowerCase() !== key ? await geocodeOnce(raw) : null;
    if (second) return second;
    throw new ToolError(
      "not_found",
      `no geocoding match for "${raw}"`,
      `I couldn't find a place called ${raw}. Which city is that near?`,
    );
  });
}

async function geocodeOnce(name: string): Promise<GeoPoint | null> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const raw = await upstream(() => fetchJsonWithTimeout(url, { method: "GET" }, WEATHER_TIMEOUT_MS), "geocoding");
  const parsed = geocodeResponse.safeParse(raw);
  if (!parsed.success) throw upstreamShapeError("geocoding");
  const hit = parsed.data.results?.[0];
  if (!hit) return null;
  const region = hit.country_code === "US" ? hit.admin1 : (hit.country ?? hit.admin1);
  return {
    lat: hit.latitude,
    lng: hit.longitude,
    name: hit.name,
    label: region && region !== hit.name ? `${hit.name}, ${region}` : hit.name,
  };
}

function forecastUrl(lat: number, lng: number): string {
  return (
    `${FORECAST_URL}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(BUSINESS_TZ)}&forecast_days=2`
  );
}

async function forecast(lat: number, lng: number): Promise<ForecastPayload> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  return weatherCache.getOrSet(key, async () => {
    const raw = await upstream(() => fetchJsonWithTimeout(forecastUrl(lat, lng), { method: "GET" }, WEATHER_TIMEOUT_MS), "forecast");
    const parsed = forecastResponse.safeParse(raw);
    if (!parsed.success) throw upstreamShapeError("forecast");
    return parsed.data;
  });
}

async function upstream<T>(fn: () => Promise<T>, what: "geocoding" | "forecast"): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ToolError) throw err;
    if (err instanceof HttpTimeoutError) {
      throw new ToolError(
        "upstream",
        `weather ${what} timed out after ${WEATHER_TIMEOUT_MS} ms`,
        "The weather service is slow to answer right now. I can check again in a moment.",
        { timeout_ms: WEATHER_TIMEOUT_MS, stage: what },
      );
    }
    const status = err instanceof HttpStatusError ? err.status : undefined;
    throw new ToolError(
      "upstream",
      status ? `weather ${what} responded with HTTP ${status}` : `could not reach weather ${what}`,
      "I couldn't reach the weather service just now. I can check again in a moment.",
      { stage: what, ...(status ? { status } : {}) },
    );
  }
}

function upstreamShapeError(what: "geocoding" | "forecast"): ToolError {
  return new ToolError(
    "upstream",
    `unexpected response shape from weather ${what}`,
    "The weather service came back garbled. I can check again in a moment.",
    { stage: what },
  );
}

// ---------------------------------------------------------------------------
// `when` parsing and forecast shaping (pure; unit-tested directly)

export function parseWhen(when: string | undefined): WhenSpec {
  const w = (when ?? "now").trim().toLowerCase();
  if (w === "" || w === "now") return { kind: "now" };
  if (w === "today") return { kind: "today" };
  if (w === "tomorrow") return { kind: "tomorrow" };
  const at = new Date(when!.trim());
  if (!/^\d{4}-\d{2}-\d{2}/.test(w) || Number.isNaN(at.getTime())) {
    throw new ToolError(
      "validation",
      `unrecognized when: ${when}`,
      "Did you want the weather for now, today, tomorrow, or a specific time?",
      { when },
    );
  }
  return { kind: "at", at };
}

type Hour = {
  at: Date;
  /** ET calendar day "yyyy-MM-dd", ET hour 0-23 and spoken clock "3 PM", precomputed once per payload. */
  day: string;
  hourET: number;
  clock: string;
  temp_f: number;
  precip_prob: number;
  code: number;
};

/** Parsed once per cached payload so cache hits stay well under the 5 ms budget. */
const hoursByPayload = new WeakMap<ForecastPayload, Hour[]>();

function toHours(payload: ForecastPayload): Hour[] {
  const memo = hoursByPayload.get(payload);
  if (memo) return memo;
  const { time, temperature_2m, precipitation_probability, weather_code } = payload.hourly;
  const out: Hour[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = temperature_2m[i];
    if (t == null) continue;
    // Open-Meteo returns wall-clock times in the requested zone with no offset.
    const at = fromZonedTime(time[i], BUSINESS_TZ);
    const [day, hour, clock] = formatInTimeZone(at, BUSINESS_TZ, "yyyy-MM-dd|H|h a").split("|");
    out.push({
      at,
      day,
      hourET: Number(hour),
      clock,
      temp_f: Math.round(t),
      precip_prob: precipitation_probability[i] ?? 0,
      code: weather_code[i] ?? 3,
    });
  }
  hoursByPayload.set(payload, out);
  return out;
}

function floorHour(d: Date): Date {
  return new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);
}

type Days = { today: string; tomorrow: string };

function daysAround(now: Date): Days {
  return { today: isoDateET(now), tomorrow: isoDateET(new Date(now.getTime() + 24 * HOUR_MS)) };
}

function hourLabel(h: Hour, days: Days): string {
  if (h.day === days.today) return h.clock;
  if (h.day === days.tomorrow) return `Tomorrow ${h.clock}`;
  return `${formatDayET(h.at)}, ${h.clock}`;
}

function selectHours(hours: Hour[], when: WhenSpec, now: Date, days: Days): Hour[] {
  switch (when.kind) {
    case "now":
    case "today": {
      const from = floorHour(now).getTime();
      return hours.filter((h) => h.at.getTime() >= from).slice(0, 8);
    }
    case "tomorrow":
      return hours.filter((h) => h.day === days.tomorrow && h.hourET >= 8 && h.hourET <= 18);
    case "at": {
      let best: Hour | null = null;
      let bestDiff = Infinity;
      for (const h of hours) {
        const diff = Math.abs(h.at.getTime() - when.at.getTime());
        if (diff < bestDiff) {
          best = h;
          bestDiff = diff;
        }
      }
      if (!best || bestDiff > HOUR_MS) {
        throw new ToolError(
          "validation",
          "requested time is outside the two-day forecast window",
          "I can only see the forecast through tomorrow.",
          { when: when.at.toISOString() },
        );
      }
      return [best];
    }
  }
}

/** "a 60 percent" / "an 80 percent": the article TTS needs for the spoken number. */
function pct(n: number): string {
  const v = Math.round(n);
  const vowelSound = v === 8 || v === 11 || v === 18 || (v >= 80 && v <= 89);
  return `${vowelSound ? "an" : "a"} ${v} percent`;
}

/** "with a 60 percent chance of storms after 3 PM" or "" when dry. */
function rainClause(window: Hour[]): string {
  if (window.length === 0) return "";
  const maxProb = Math.max(...window.map((h) => h.precip_prob));
  if (maxProb < 30) return "";
  const threshold = Math.max(30, maxProb - 20);
  const firstIdx = window.findIndex((h) => h.precip_prob >= threshold);
  const kind = window.some((h) => codeGroup(h.code) === "storm") ? "storms" : "rain";
  // "after 3 PM" when the risk starts later in the window; nothing when it is already here.
  const timing = firstIdx > 0 ? ` after ${window[firstIdx].clock}` : "";
  return `, with ${pct(maxProb)} chance of ${kind}${timing}`;
}

/** Sky word for a window: the precipitation kind if it dominates, else the modal sky. */
function windowConditions(window: Hour[]): string {
  if (window.length === 0) return "unsettled";
  const wet = window.filter((h) => ["rain", "snow", "storm"].includes(codeGroup(h.code)));
  if (wet.length >= Math.max(3, Math.ceil(window.length / 2))) {
    return weatherCodeLabel(worstCode(wet));
  }
  const counts = new Map<string, number>();
  for (const h of window) {
    if (wet.includes(h)) continue;
    const label = weatherCodeLabel(h.code);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best = "unsettled";
  let bestN = -1;
  for (const [label, n] of counts) {
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best;
}

const SEVERITY: Record<CodeGroup, number> = { clear: 0, cloudy: 1, fog: 2, rain: 3, snow: 4, storm: 5 };
function worstCode(hours: Hour[]): number {
  return hours.reduce((worst, h) => (SEVERITY[codeGroup(h.code)] > SEVERITY[codeGroup(worst)] ? h.code : worst), hours[0].code);
}

/** Shape the cached payload for the requested `when`; pure and fast (cache hits stay < 5 ms). */
export function buildWeatherResult(
  payload: ForecastPayload,
  place: { name: string; label: string },
  when: WhenSpec,
  now: Date,
): WeatherResult {
  const days = daysAround(now);
  const hours = toHours(payload);
  const window = selectHours(hours, when, now, days);
  const cur = payload.current;
  const current = {
    temp_f: Math.round(cur.temperature_2m),
    feels_like_f: Math.round(cur.apparent_temperature),
    humidity: Math.round(cur.relative_humidity_2m),
    conditions: weatherCodeLabel(cur.weather_code),
  };
  const forecast = window.map((h) => ({
    time_label: hourLabel(h, days),
    temp_f: h.temp_f,
    precip_prob: h.precip_prob,
    conditions: weatherCodeLabel(h.code),
  }));

  let speech_hint: string;
  switch (when.kind) {
    case "now": {
      const wetNow = ["rain", "snow", "storm"].includes(codeGroup(cur.weather_code));
      const descriptor = wetNow ? current.conditions : current.humidity >= 70 ? "humid" : current.conditions;
      speech_hint = `It's ${current.temp_f} and ${descriptor} in ${place.name} right now${rainClause(window)}.`;
      break;
    }
    case "today":
    case "tomorrow": {
      const lead = when.kind === "today" ? `Over the next eight hours in ${place.name}, expect` : `Tomorrow in ${place.name} looks like`;
      if (window.length === 0) {
        speech_hint = `I don't have an hourly forecast for ${place.name} for that period.`;
        break;
      }
      const temps = window.map((h) => h.temp_f);
      const lo = Math.min(...temps);
      const hi = Math.max(...temps);
      const range = lo === hi ? `${hi}` : `${lo} to ${hi}`;
      speech_hint = `${lead} ${range} and ${windowConditions(window)}${rainClause(window)}.`;
      break;
    }
    case "at": {
      const h = window[0];
      const whenWords =
        h.day === days.today ? `${h.clock} today` : h.day === days.tomorrow ? `${h.clock} tomorrow` : `${h.clock} on ${formatDayET(h.at)}`;
      const rain =
        h.precip_prob >= 30 ? ` with ${pct(h.precip_prob)} chance of ${codeGroup(h.code) === "storm" ? "storms" : "rain"}` : "";
      speech_hint = `Around ${whenWords} in ${place.name}, expect ${h.temp_f} and ${weatherCodeLabel(h.code)}${rain}.`;
      break;
    }
  }

  return { location_label: place.label, current, forecast, speech_hint };
}

// ---------------------------------------------------------------------------

export const getWeather = defineTool({
  description:
    "Current conditions and short forecast for a place, in Fahrenheit. Use it when a caller or tech asks about heat, rain, or storms affecting a visit. " +
    "Give a city or address label (Florida is assumed if no state is given; defaults to Miami, FL) or lat/lng. " +
    "'when' can be 'now', 'today' (next 8 hours), 'tomorrow' (8 AM to 6 PM), or an ISO date-time for a specific hour.",
  input,
  handler: async (args): Promise<WeatherResult> => {
    const when = parseWhen(args.when);
    if ((args.lat == null) !== (args.lng == null)) {
      throw new ToolError("validation", "lat and lng must be given together", "I need both latitude and longitude, or just a city name.", {
        lat: args.lat ?? null,
        lng: args.lng ?? null,
      });
    }
    const now = weatherDeps.now();

    let place: GeoPoint;
    if (args.lat != null && args.lng != null) {
      const label = args.location?.trim() || `${args.lat.toFixed(2)}, ${args.lng.toFixed(2)}`;
      place = { lat: args.lat, lng: args.lng, name: args.location?.trim().split(",")[0] || "that location", label };
    } else {
      place = await geocode(args.location?.trim() || DEFAULT_LOCATION);
    }

    const payload = await forecast(place.lat, place.lng);
    return buildWeatherResult(payload, place, when, now);
  },
});
