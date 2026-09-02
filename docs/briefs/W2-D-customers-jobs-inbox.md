# W2-D — Customers & addresses, Jobs, Inbox

## Ground rules (all Wave 2 units)
- Repo: /Users/dev/work/kebra (branch main). Read `docs/PLAN.md` §1, §2, §6, §7, then `docs/TOOLS.md`, `docs/EVENTS.md`, and skim `src/agent/registry.ts`, `src/agent/tools/*.ts`, `src/domain/*.ts`, `src/lib/{auth,session,events,time}.ts`. Wave 1 built the domain; Wave 2 only wires it to the phone and the screen. Do not reimplement domain logic in UI code; call the domain functions (office actions) or the tools (agent).
- Stack facts: Next 16 App Router (route `params` are Promises; `middleware.ts` guards pages; use server components + server actions; `getCurrentUser()` / `requireUser()` from `src/lib/auth.ts`; `actorFromUser(user)` gives the event actor), Tailwind v4 + shadcn/ui components already installed in `src/components/ui`, zod v4, Drizzle. Business time zone helpers in `src/lib/time.ts`; everything shown to the office is Eastern Time.
- Live updates: subscribe to `GET /api/events/stream?since=<id>` (SSE, JSON rows). Build one small client hook `useLiveEvents(filter)` in `src/lib/use-live-events.ts` if it does not exist yet; if another unit already created it, reuse it unchanged.
- Visual bar: clean, dense, operational. Neutral palette, one accent for the agent (badge "Agent"), status colors: scheduled blue, in progress amber, complete green, canceled gray, pending cancellation striped red, needs scheduling purple. No marketing fluff. Mobile-usable but desktop-first.
- Do not commit or push; do not run git stash/checkout/reset; stay inside the files you own; never print secrets. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` before reporting.
- Report back under 300 words: what shipped, how verified (include a screenshot path if you took one via the running dev server), deviations, risks, files created/changed.

## You own
`src/app/customers/**`, `src/app/addresses/**`, `src/app/jobs/**`, `src/app/inbox/**`, `src/components/customers/**`, `src/components/jobs/**`, `src/components/inbox/**`, tests. Use W1-A search (`src/domain/search.ts`), W1-C (`history`, `warranty`, `dossier-fallback`), W1-B office functions for mutations.

## Deliverables
1. `/customers`: search (name/company/address via `findCustomer` + `findAddress`), table with kind, sites, last job, open balance. `/customers/[id]`: header (display name, kind, phones from `customer_phones`, open balance, sites count), LLM summary from `customer_dossiers` when present, sites list → address pages, upcoming jobs, invoices with expandable line items, recent calls (link to W2-C).
2. `/addresses/[id]`: the dossier page. Header (address, customer, warranty status pill with basis tooltip), the `summary_md` card (from `address_dossiers`, fallback deterministic), equipment panel, open/recurring issues, access notes (masked by default, click to reveal, logged? no logging needed), visit timeline (each visit: date, tech, one-line, expand to full notes and invoice lines), upcoming jobs, "Book a job" button (dialog: service type, availability from `findAvailability`, tech; calls `bookJob` with office actor).
3. `/jobs`: filters (status, tech, date range, tag, source), table, quick status badges. `/jobs/[id]`: everything on the card plus notes thread (add note), reschedule/reassign/status/cancel (office cancel is immediate, admin-only? no: any office user may cancel directly from here; the two-step flow is only for the agent), pending cancellation banner linking to the Inbox item, invoice.
4. `/inbox`: tasks grouped by kind (handoff, callback, cancellation, review, followup), status filter, assign to user, resolve/dismiss; each item links to customer/job/call. Cancellation items show the transcript excerpt (from `change_requests.transcript_ref` against `calls.transcript`) and Approve/Reject buttons **rendered only for admin/owner** (`isAdmin`) calling W1-B `approveCancellation`/`rejectCancellation` — W2-E owns the approval screen logic; coordinate by importing its component if it exists at `src/components/inbox/cancellation-approval.tsx`, else render a placeholder that W2-E replaces.
5. Mount the shared activity strip from W2-B on the customer, address and job pages if it exists (`src/components/activity-strip.tsx`); otherwise skip.

## Acceptance
- Address page for 103 Grouper Landing Rd shows the two-system install, equipment lines, and a warranty pill; for a Starfish Hospitality unit shows the property-manager context.
- Booking from the address page creates a job visible on the Today board and emits the event with the office user's name.
