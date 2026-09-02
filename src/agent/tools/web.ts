// Owned by W1-E (see docs/briefs/). Register tools here; the registry merges this map.
import type { ToolDef } from "@/agent/registry";
import { webSearch } from "@/agent/tools/web-search";
import { getWeather } from "@/agent/tools/get-weather";

export const tools: Record<string, ToolDef> = {
  web_search: webSearch,
  get_weather: getWeather,
};
