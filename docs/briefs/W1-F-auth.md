# W1-F — Named office logins

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
`src/lib/auth.ts`, `src/lib/session.ts`, `src/middleware.ts`, `src/app/login/*`, `src/app/api/auth/*`, `src/db/seed-users.ts`, tests. You may add a `pnpm db:seed-users` script.

## Deliverables
1. Email + password auth with no external service: `bcryptjs` for hashes (add dep), signed session cookie (`jose` HS256 with `SESSION_SECRET`, httpOnly, secure in prod, sameSite lax, 7-day expiry, sliding). Helpers: `getCurrentUser()` (server components and route handlers), `requireUser(roles?)`, `login`, `logout`.
2. `src/middleware.ts`: everything under `/` requires a session except `/login`, `/api/health`, `/api/voice/*`, `/api/agent/*` (those authenticate with `x-agent-secret` / Vapi secret, not sessions), `/_next/*`, static assets.
3. Seed users from `employees` where role is admin or office staff, plus an `owner` account and a `grader` account (role admin): emails `first.last@gulfbreezeair.demo`, `owner@gulfbreezeair.demo`, `grader@gulfbreezeair.demo`; passwords generated once (`openssl rand`-style, 12 chars) and written to `docs/CREDENTIALS.local.md` which must be in `.gitignore` (add the line). Print nothing secret to the console except the path of that file.
4. Login page: minimal, on-brand (company name, email, password, error state). After login redirect to `/` (Today). A user menu in the layout with name, role and Logout (coordinate: only touch the header slot the layout exposes; if none exists add a `UserMenu` component and a single import line in `src/app/layout.tsx`).
5. `emitEvent({type: "user.login"})` on success. Role check helper `isAdmin(user)` = owner or admin, used by W2-E for cancellation approval.
6. Wire `ctx.actor` for office-initiated domain calls: an `actorFromUser(user)` helper returning `{ userId, label }`.

## Acceptance
- Tests: hash/verify, session sign/verify/expiry, middleware allow/deny matrix (including that `/api/agent/tools/ping` without a session but with the right secret returns 200 and without the secret returns 401).
- Manual: log in as grader, see Today; log out; hitting `/calls` redirects to `/login?next=/calls`.

## Addendum (coordinator, after W0)
- **Do not commit or push.** Work in the shared tree; the coordinator reviews and commits. Stay strictly inside the files you own.
- **Schema is already extended** (migration `0001`): `addresses.house_number`, `addresses.street_name`, `jobs.service_type`, `change_requests.previous_status`, tables `idempotency_keys` and `dossier_batches`. Do not run `db:generate`; if you truly need another column, stop and report it.
- **Register tools in your unit's module**, not in `registry.ts`: `src/agent/tools/lookup.ts` (W1-A), `schedule.ts` (W1-B), `knowledge.ts` (W1-C), `web.ts` (W1-E). Export `tools: Record<string, ToolDef>` using `defineTool` from `@/agent/registry`; the registry already spreads these maps.
- **Errors and speech:** throw `ToolError` from `src/agent/errors.ts` for expected failures; include `speech_hint` in your result object (the dispatcher hoists it). See `docs/TOOLS.md` "Handler convention".
- **Facts from W0:** Next 16 (route `params` are Promises), zod v4, `db` from `@/db` is lazy, `emitEvent` in `src/lib/events.ts` takes `{ actor: "agent"|"office"|"system", actorId?, type, entityType, entityId?, payload, callId? }` and callers put `actor_label` and `summary` in `payload`.
- Local Postgres is shared with other units running in parallel: never truncate tables you don't own; W1-A is the only unit allowed to reload imported tables, and it runs first.
