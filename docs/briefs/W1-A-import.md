# W1-A — Data import

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

## Goal
Load `front-desk-assignment/data/*.jsonl` into Postgres idempotently and make addresses findable from messy spoken input.

## You own
`scripts/import.ts`, `src/lib/address-normalize.ts`, `src/domain/search.ts`, `src/agent/tools/find-address.ts`, `src/agent/tools/find-customer.ts`, their tests, and the registry entries for `find_address`, `find_customer`, `save_caller_phone`.

## Deliverables
1. `pnpm import` (tsx scripts/import.ts): truncate-and-reload or upsert; loads employees, customers (+ addresses from `customers.addresses` and from jobs, deduped by address id), jobs, job_assignments, notes (seq = original order; author_type heuristic: office if it looks like booking/follow-up text, tech if it describes findings/work; default office for first note, tech for later ones), invoices, invoice_items. Emits one `system.import` event. Prints counts. Expected: 1,992 jobs, 6,954 notes, 1,700 invoices, 732 customers, 23 employees.
2. `customers.display_name`: company if set, else "First Last", else last non-null. Note that many property managers have kind=homeowner with the company in first/last name; do not "fix" the data, just display it.
3. `addresses.search_text`: lowercase "street unit city zip" with normalization from `address-normalize.ts`: expand/contract directionals (E/East), suffixes (Rd/Road, Ln/Lane, Ct/Court, Dr/Drive, Blvd, Trl/Trail, Cv/Cove, Sq/Square), strip punctuation, spell out nothing (keep digits), and also store `house_number` int and `street_name` text columns (add via migration) for exact-number boosting.
4. `findAddress(query, {unit, city, customerId})` in `src/domain/search.ts`: normalize the query the same way; SQL with `similarity(search_text, $q)` plus boosts: +0.25 exact house number match, +0.1 city match, +0.15 customer match, +0.05 visited in last 180 days; return top 5 with confidence clamped 0..1; if multiple rows share house_number+street_name and differ by unit → set `needs_unit: true` and list units in `speech_hint`. Also handle spoken numbers ("thirty-two eighty-four" → 3284) with a small words-to-number helper; test it.
5. `findCustomer` by trigram on display_name/company or exact E.164 on `customer_phones`.
6. Tools registered per `docs/TOOLS.md` with correct `speech_hint`s.

## Acceptance
- `pnpm import` twice yields identical counts (idempotent).
- A test file with ≥20 spoken-style queries hits the right address_id as top candidate, including: "3284 Harborlight Hollow", "thirty two eighty four harborlight hollow lane coral gables", "10254 East Old Mangrove unit 36W", "ten two five four old mangrove road high pointe 422", "89 harborlight shores" (check what exists; if it doesn't, the test asserts a sensible nearest candidate with confidence < 0.85), "4 Harborlight Shores Boulevard South", "1231 Harborlight Cay Road 283", plus 13 more you pick across cities.
- `find_address` p95 < 150 ms locally (log timings in the test).

## Addendum (coordinator, after W0)
- **Do not commit or push.** Work in the shared tree; the coordinator reviews and commits. Stay strictly inside the files you own.
- **Schema is already extended** (migration `0001`): `addresses.house_number`, `addresses.street_name`, `jobs.service_type`, `change_requests.previous_status`, tables `idempotency_keys` and `dossier_batches`. Do not run `db:generate`; if you truly need another column, stop and report it.
- **Register tools in your unit's module**, not in `registry.ts`: `src/agent/tools/lookup.ts` (W1-A), `schedule.ts` (W1-B), `knowledge.ts` (W1-C), `web.ts` (W1-E). Export `tools: Record<string, ToolDef>` using `defineTool` from `@/agent/registry`; the registry already spreads these maps.
- **Errors and speech:** throw `ToolError` from `src/agent/errors.ts` for expected failures; include `speech_hint` in your result object (the dispatcher hoists it). See `docs/TOOLS.md` "Handler convention".
- **Facts from W0:** Next 16 (route `params` are Promises), zod v4, `db` from `@/db` is lazy, `emitEvent` in `src/lib/events.ts` takes `{ actor: "agent"|"office"|"system", actorId?, type, entityType, entityId?, payload, callId? }` and callers put `actor_label` and `summary` in `payload`.
- Local Postgres is shared with other units running in parallel: never truncate tables you don't own; W1-A is the only unit allowed to reload imported tables, and it runs first.
