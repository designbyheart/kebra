# W2-B — Today: live dispatch board + activity strip

## Ground rules (all Wave 2 units)
- Repo: /Users/dev/work/kebra (branch main). Read `docs/PLAN.md` §1, §2, §6, §7, then `docs/TOOLS.md`, `docs/EVENTS.md`, and skim `src/agent/registry.ts`, `src/agent/tools/*.ts`, `src/domain/*.ts`, `src/lib/{auth,session,events,time}.ts`. Wave 1 built the domain; Wave 2 only wires it to the phone and the screen. Do not reimplement domain logic in UI code; call the domain functions (office actions) or the tools (agent).
- Stack facts: Next 16 App Router (route `params` are Promises; `proxy.ts` guards pages; use server components + server actions; `getCurrentUser()` / `requireUser()` from `src/lib/auth.ts`; `actorFromUser(user)` gives the event actor), Tailwind v4 + shadcn/ui components already installed in `src/components/ui`, zod v4, Drizzle. Business time zone helpers in `src/lib/time.ts`; everything shown to the office is Eastern Time.
- Live updates: subscribe to `GET /api/events/stream?since=<id>` (SSE, JSON rows). Build one small client hook `useLiveEvents(filter)` in `src/lib/use-live-events.ts` if it does not exist yet; if another unit already created it, reuse it unchanged.
- Visual bar: clean, dense, operational. Neutral palette, one accent for the agent (badge "Agent"), status colors: scheduled blue, in progress amber, complete green, canceled gray, pending cancellation striped red, needs scheduling purple. No marketing fluff. Mobile-usable but desktop-first.
- Do not commit or push; do not run git stash/checkout/reset; stay inside the files you own; never print secrets. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` before reporting.
- Report back under 300 words: what shipped, how verified (include a screenshot path if you took one via the running dev server), deviations, risks, files created/changed.

## You own
`src/app/today/**` (or `src/app/(app)/today` if a route group exists), `src/components/board/**`, `src/components/activity-strip.tsx`, `src/lib/use-live-events.ts` (create if missing), `src/app/api/board/route.ts` (JSON for the client refetch), tests.

## Deliverables
1. `/today?date=YYYY-MM-DD` (default today in ET): timeline grid, one row per field tech working that day (plus "Unassigned" and "Needs scheduling" lanes), columns 7 AM–9 PM in ET, job cards positioned by window with status color, priority flag, customer, address (street + unit), description, invoice number, source badge ("Agent" when `source = agent`). Header shows the day summary from `getSchedule` (`src/domain/schedule.ts`, W1-C) and a date switcher (prev / today / next / picker).
2. Card click → side sheet with job details, notes (add note via server action → `addNote` domain fn with office actor), reschedule (pick from `findAvailability` for that service type + tech, or free-form window), reassign tech, status change, and the "pending cancellation" banner with a link to the Inbox item when applicable. All mutations use W1-B domain functions with `actorFromUser(user)`.
3. Live: subscribe to SSE; on any `job.*` event for the shown date refetch `/api/board?date=`; the changed card animates (brief highlight). New agent bookings must appear without a reload while a call is in progress — this is the demo moment.
4. Activity strip (`activity-strip.tsx`): last 20 events with actor label, summary, relative time, agent badge, link to call when `call_id` set; live-prepends new events. Export it so other pages can mount it (W2-C/D will import it).
5. Empty/loading/error states. Keyboard: arrows switch days.

## Acceptance
- With the imported data, 2026-09-02 shows 10 scheduled jobs across the right techs, and a `book_job` call via `curl` to the tool endpoint (with the secret) makes a new card appear within ~2 s without reload.
- Vitest for the layout math (window → column offsets, overlapping cards stack) and the date parsing in ET (DST-safe).
