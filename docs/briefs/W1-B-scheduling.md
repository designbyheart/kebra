# W1-B — Scheduling domain: availability, booking, reschedule, cancellation request, notes, tasks

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
The write side of the platform. Everything the agent and the office do to the calendar goes through these functions.

## You own
`src/domain/availability.ts`, `src/domain/jobs.ts`, `src/domain/notes.ts`, `src/domain/tasks.ts`, `src/domain/change-requests.ts`, `src/agent/tools/{find-availability,book-job,reschedule-job,request-cancellation,add-note,create-task}.ts`, tests, registry entries. You may add columns via additive migration (e.g. `change_requests.previous_status`, `jobs.service_type`).

## Deliverables
1. `findAvailability(params)` exactly per TOOLS.md: business hours from `business_hours`; candidate windows every hour on the hour within hours; duration from `service_types`; tech is free if no job with status in (scheduled, in progress, pending_cancellation, needs scheduling with a window) overlaps `[start, start+duration)`; skip windows starting in the past (now in ET); tech ranking: last tech at `address_id` (from most recent completed job) → least jobs that day → employee jobs count as tie-break; return up to `limit` distinct slots spread across days (not 4 slots on the same morning: at most 2 per day unless only one day requested). Only `field tech` role employees are schedulable.
2. `bookJob`, `rescheduleJob`, `requestCancellation`, `addNote`, `createTask` per TOOLS.md, each in a transaction, each emitting exactly one event via `emitEvent`, each honoring `idempotency_key` (store in a small `idempotency_keys` table: key, tool, result jsonb, created_at).
3. Next invoice number: `max(invoice_number::int)+1` under the transaction (advisory lock).
4. Office-side functions the UI will call (no agent tool): `cancelJob(jobId, byUserId, reason)`, `approveCancellation(changeRequestId, byUserId)`, `rejectCancellation(changeRequestId, byUserId, note)` (restores `previous_status`, creates a callback task), `assignJob(jobId, employeeId, byUserId)`, `setJobStatus`.
5. Tools registered with `speech_hint`s written for a phone conversation: slot offers read like "I have Tuesday between 10 and noon with Tanya, or Wednesday 1 to 3 with Felix."

## Acceptance
- Unit tests: no double booking across techs; respects Sat hours and Sun closed; DST-safe (test a date in November); past windows excluded; last-tech preference; least-loaded fallback; reschedule of a completed job → `invalid_state`; idempotent replay returns same job_id; cancellation request flips status and creates the admin task; reject restores status.
- Seed sanity: with the imported data, `findAvailability({from: today, service_type: "diagnostic"})` returns ≥3 slots, none colliding with the 38 real jobs scheduled 2026-09-02 → 09-15.
