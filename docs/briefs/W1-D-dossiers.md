# W1-D — Address and customer dossiers with Claude (Batch API)

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
Precompute a faithful, compact summary per address (≈1,364) and per customer (732) so the voice agent answers history questions in one tool call. Runs once, resumable, cost-logged.

## You own
`scripts/dossiers.ts`, `src/lib/anthropic.ts`, `src/domain/dossier-prompt.ts`, tests. Writes into `address_dossiers` and `customer_dossiers` only.

## Rules
- Use the official `@anthropic-ai/sdk`. Model `claude-opus-5`. Use the Message Batches API (`client.messages.batches.create`), results keyed by `custom_id`, never by position. Structured output via `output_config.format` with a JSON schema matching the dossier fields (summary_md ≤ 90 words spoken-friendly, last_visit_summary one sentence, equipment[], open_issues[], recurring_issues[], access_notes_present boolean, warranty_notes string, risk_flags[] e.g. "unpaid balance", "repeat callback"). Do not use `budget_tokens` or prefill. Include `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` and check `stop_reason` for `refusal`.
- Input per address: customer header, every job at the address (date, description, status, techs, tags, invoice lines) and all notes in order, already redacted. Whole corpus is ≈380K tokens, so per-address inputs are small; cap at 60K tokens per request and truncate oldest notes first if exceeded.
- System prompt: "You write the front-desk memory card for an HVAC company. Only state what the notes and invoices support. Prefer dates, technician first names, parts and outcomes. Never include door codes, phone numbers or emails. If something is unresolved, say so."
- Idempotent and resumable: skip rows whose `generated_at` is newer than the latest job update at that address; persist the batch id in a `dossier_batches` table (add via migration) so a re-run can poll an in-flight batch instead of resubmitting.
- Log token usage and cost (input $5/M, output $25/M, batch = 50%) into the report and a `receipts/claude-dossiers.md` line.
- Provide `pnpm dossiers -- --limit 20` for a spot-check run before the full batch, and `pnpm dossiers -- --status <batch_id>`.

## Acceptance
- Spot-check 15 addresses (mix of multi-unit property-management sites and single homes): every claim in `summary_md` traceable to a note or invoice line (write the check as a small script that prints the dossier next to its source notes; you eyeball and report).
- Full run completes; count of rows in `address_dossiers` = number of addresses with ≥1 job; `customer_dossiers` = customers with ≥1 job; total cost reported.
- The `get_address_dossier` tool (W1-C) shows the LLM `summary_md` when present.

## Addendum (coordinator, after W0)
- **Do not commit or push.** Work in the shared tree; the coordinator reviews and commits. Stay strictly inside the files you own.
- **Schema is already extended** (migration `0001`): `addresses.house_number`, `addresses.street_name`, `jobs.service_type`, `change_requests.previous_status`, tables `idempotency_keys` and `dossier_batches`. Do not run `db:generate`; if you truly need another column, stop and report it.
- **Register tools in your unit's module**, not in `registry.ts`: `src/agent/tools/lookup.ts` (W1-A), `schedule.ts` (W1-B), `knowledge.ts` (W1-C), `web.ts` (W1-E). Export `tools: Record<string, ToolDef>` using `defineTool` from `@/agent/registry`; the registry already spreads these maps.
- **Errors and speech:** throw `ToolError` from `src/agent/errors.ts` for expected failures; include `speech_hint` in your result object (the dispatcher hoists it). See `docs/TOOLS.md` "Handler convention".
- **Facts from W0:** Next 16 (route `params` are Promises), zod v4, `db` from `@/db` is lazy, `emitEvent` in `src/lib/events.ts` takes `{ actor: "agent"|"office"|"system", actorId?, type, entityType, entityId?, payload, callId? }` and callers put `actor_label` and `summary` in `payload`.
- Local Postgres is shared with other units running in parallel: never truncate tables you don't own; W1-A is the only unit allowed to reload imported tables, and it runs first.
