# W1-E — Web tools: search and weather

## Ground rules (all Wave 1 units)
- Repo: /Users/dev/work/kebra (branch main). Read `docs/PLAN.md` §2, §4, §7, then `docs/TOOLS.md` and `docs/EVENTS.md` before coding. They are the contract; if you must deviate, write the deviation into `docs/TOOLS.md` changelog and say so in your report.
- Stack: Next.js (src/), TypeScript strict, Drizzle (`src/db/schema.ts`), postgres.js, zod, vitest, date-fns-tz. Business time zone `America/New_York` via `src/lib/time.ts`. Money in cents.
- Only touch the files listed under "You own". Do not edit `src/db/schema.ts` without noting it in the report; prefer additive migrations (`pnpm db:generate`) and never rewrite existing migrations.
- Local DB: `docker compose up -d` (Postgres on localhost:5433, `DATABASE_URL` in `.env`). Never print secret values.
- Tests: vitest, colocated `*.test.ts`. Domain logic must be unit-tested against a real local DB (use a transaction per test or a dedicated schema).
- Commit on main in small commits, push at the end. Commit messages end with:
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YaWxHEwLjBK5vGFxhxRLd6
- Report back: what shipped, how you verified it, deviations from the contract, open risks. Keep it under 300 words.

## You own
`src/agent/tools/web-search.ts`, `src/agent/tools/get-weather.ts`, `src/lib/cache.ts` (tiny in-memory TTL cache), tests, registry entries.

## Deliverables
1. `web_search` via Tavily REST (`POST https://api.tavily.com/search`, bearer `TAVILY_API_KEY`, `search_depth: "basic"`, `include_answer: "basic"`, `max_results`), 4 s timeout with AbortController, 10-minute cache. Result and `speech_hint` per TOOLS.md. On upstream failure return `ok:false, code: upstream` with a graceful `speech_hint`.
2. `get_weather` via Open-Meteo: geocode `location` with `https://geocoding-api.open-meteo.com/v1/search?name=...&count=1` (bias: append ", Florida" if no state given), forecast with `https://api.open-meteo.com/v1/forecast?latitude&longitude&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&temperature_unit=fahrenheit&timezone=America/New_York&forecast_days=2`. Map weather codes to plain words. `when` selects: now → current; today → next 8 hours summarized; tomorrow → 8am–6pm summary; ISO → nearest hour. 15-minute cache. Default location Miami, FL.
3. `speech_hint` examples: "It's 91 and humid in Homestead right now, with a 60 percent chance of storms after 3." Keep it one sentence.

## Acceptance
- Tests with mocked fetch for both tools (success, timeout, upstream error) plus one live smoke test guarded by `RUN_LIVE=1`.
- Both tools respond < 1.5 s live (cache miss) and < 5 ms on cache hit.

## Addendum (coordinator, after W0)
- **Do not commit or push.** Work in the shared tree; the coordinator reviews and commits. Stay strictly inside the files you own.
- **Schema is already extended** (migration `0001`): `addresses.house_number`, `addresses.street_name`, `jobs.service_type`, `change_requests.previous_status`, tables `idempotency_keys` and `dossier_batches`. Do not run `db:generate`; if you truly need another column, stop and report it.
- **Register tools in your unit's module**, not in `registry.ts`: `src/agent/tools/lookup.ts` (W1-A), `schedule.ts` (W1-B), `knowledge.ts` (W1-C), `web.ts` (W1-E). Export `tools: Record<string, ToolDef>` using `defineTool` from `@/agent/registry`; the registry already spreads these maps.
- **Errors and speech:** throw `ToolError` from `src/agent/errors.ts` for expected failures; include `speech_hint` in your result object (the dispatcher hoists it). See `docs/TOOLS.md` "Handler convention".
- **Facts from W0:** Next 16 (route `params` are Promises), zod v4, `db` from `@/db` is lazy, `emitEvent` in `src/lib/events.ts` takes `{ actor: "agent"|"office"|"system", actorId?, type, entityType, entityId?, payload, callId? }` and callers put `actor_label` and `summary` in `payload`.
- Local Postgres is shared with other units running in parallel: never truncate tables you don't own; W1-A is the only unit allowed to reload imported tables, and it runs first.
