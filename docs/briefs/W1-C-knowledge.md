# W1-C — Knowledge domain: history, job lookup, warranty, day schedule, deterministic dossier fallback

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
The read side that makes the agent sound like it knows the business. No LLM calls here; this must be fast and explainable.

## You own
`src/domain/history.ts`, `src/domain/warranty.ts`, `src/domain/schedule.ts`, `src/domain/dossier-fallback.ts`, `src/agent/tools/{get-address-dossier,get-visit-history,get-job-notes,get-job,check-warranty,get-open-balance,get-schedule}.ts`, tests, registry entries.

## Deliverables
1. `getVisitHistory`, `getJob`, `getJobNotes`, `getOpenBalance` per TOOLS.md. `one_line` summaries: take the last tech-authored note, first sentence, ≤140 chars; fall back to description. Redact anything matching a code/phone/email pattern.
2. `checkWarranty(addressId)` implementing the rules in TOOLS.md with an `evidence[]` list (tags, install jobs, WARRANTY invoice lines, notes mentioning "warranty" within the last 24 months). Install-family detection: description or invoice item name matching /install/i or equipment lines (Trane|Goodman|Carrier|Rheem|Daikin|Lennox|Heat Pump|Air Handler|Condenser). Extract equipment for the dossier from those invoice lines (brand, tonnage from "N Ton", SEER, model if present).
3. `getSchedule(date, employeeId?)` per TOOLS.md, including tech gaps and an owner-style one-sentence summary.
4. `buildDossierFallback(addressId)` producing the `get_address_dossier` result shape deterministically from jobs/notes/invoices (last visit, equipment, warranty via checkWarranty, open issues = notes on jobs with callback tags or status needs scheduling, recurring issues = repeated invoice item families ≥2 in 12 months, access notes = notes containing "door code|gate code|lockbox|garage" with the code already redacted, upcoming jobs). `get_address_dossier` reads `address_dossiers` first (W1-D fills it) and merges: LLM `summary_md` if present, structured fields from the fallback (they are always fresh).
5. `speech_hint` quality matters most here: write and test the sentence builders ("We were last at 3284 Harborlight Hollow on August 14th; Tanya cleared the drain line and replaced the capacitor. There's a service callback tag from that visit.").

## Acceptance
- Tests against 10 hand-picked jobs from the data: at least 2 install jobs (e.g. invoice 3520 at 103 Grouper Landing Rd), 2 with `Warranty Claim`, 2 with `Service Callback`, 2 plain repairs, 2 property-management units — assert warranty status, evidence count, equipment extraction, last-visit sentence.
- `getSchedule("2026-09-02")` reports 10 scheduled jobs (matches the data) and lists techs correctly.
- p95 < 300 ms for `get_address_dossier` fallback path on local DB.
