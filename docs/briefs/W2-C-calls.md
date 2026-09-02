# W2-C — Calls: live and historical call records

## Ground rules (all Wave 2 units)
- Repo: /Users/dev/work/kebra (branch main). Read `docs/PLAN.md` §1, §2, §6, §7, then `docs/TOOLS.md`, `docs/EVENTS.md`, and skim `src/agent/registry.ts`, `src/agent/tools/*.ts`, `src/domain/*.ts`, `src/lib/{auth,session,events,time}.ts`. Wave 1 built the domain; Wave 2 only wires it to the phone and the screen. Do not reimplement domain logic in UI code; call the domain functions (office actions) or the tools (agent).
- Stack facts: Next 16 App Router (route `params` are Promises; `middleware.ts` guards pages; use server components + server actions; `getCurrentUser()` / `requireUser()` from `src/lib/auth.ts`; `actorFromUser(user)` gives the event actor), Tailwind v4 + shadcn/ui components already installed in `src/components/ui`, zod v4, Drizzle. Business time zone helpers in `src/lib/time.ts`; everything shown to the office is Eastern Time.
- Live updates: subscribe to `GET /api/events/stream?since=<id>` (SSE, JSON rows). Build one small client hook `useLiveEvents(filter)` in `src/lib/use-live-events.ts` if it does not exist yet; if another unit already created it, reuse it unchanged.
- Visual bar: clean, dense, operational. Neutral palette, one accent for the agent (badge "Agent"), status colors: scheduled blue, in progress amber, complete green, canceled gray, pending cancellation striped red, needs scheduling purple. No marketing fluff. Mobile-usable but desktop-first.
- Do not commit or push; do not run git stash/checkout/reset; stay inside the files you own; never print secrets. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` before reporting.
- Report back under 300 words: what shipped, how verified (include a screenshot path if you took one via the running dev server), deviations, risks, files created/changed.

## You own
`src/app/calls/**`, `src/components/calls/**`, `src/app/api/calls/**` (read endpoints for client refresh), tests. Reads `calls`, `events`, `tasks`; writes nothing except through domain functions (create task from a call).

## Deliverables
1. `/calls`: list newest first; live calls pinned on top with a pulsing indicator and elapsed time; columns: when, caller (masked number or "Web"), matched customer/address, duration, outcome, actions count, "needs review" flag, transfer/handoff marker. Filter chips: live, today, needs review, handoffs.
2. `/calls/[id]`: two columns. Left: transcript (agent vs caller bubbles, timestamps, auto-scroll while live, tool calls rendered inline as small system chips "looked up 3284 Harborlight Hollow · 210 ms"); recording player when `recording_url` exists. Right: header (caller, customer link, address link, duration, ended reason), **Actions taken** (from `events where call_id`: bookings with a link to the job, reschedules, notes, tasks, cancellation requests), **Promises** (`calls.promises`, filled by W3-A; render empty state "analysis pending" until then), summary, outcome, and buttons: "Create follow-up task", "Mark reviewed" (server actions with office actor; `needs_review` toggle writes event `task.updated`-style? no: add a tiny `call.reviewed` event type and record it in `docs/EVENTS.md` under Calls — you may append that one line to EVENTS.md).
3. Live behavior: while `calls.status` is not ended, poll `/api/calls/[id]` every 2 s or use the SSE feed for `call.*`/`transcript` events (W2-A appends transcript rows to the call, not events; polling the call row is acceptable) — the transcript must grow during the call.
4. Search box over transcript text and summaries (ILIKE is fine).

## Acceptance
- With fixture calls inserted by a small seed script you own (`src/db/seed-calls.ts`, 3 realistic calls with transcripts, tool calls, events), the list and detail render correctly; a call updated in the DB while the page is open reflects within 2 s.
- Vitest for the transcript grouping and the actions derivation from events.
