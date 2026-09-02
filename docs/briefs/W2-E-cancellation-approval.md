# W2-E — Cancellation approval workflow (admin, transcript-referenced)

## Ground rules (all Wave 2 units)
- Repo: /Users/dev/work/kebra (branch main). Read `docs/PLAN.md` §1, §2, §6, §7, then `docs/TOOLS.md`, `docs/EVENTS.md`, and skim `src/agent/registry.ts`, `src/agent/tools/*.ts`, `src/domain/*.ts`, `src/lib/{auth,session,events,time}.ts`. Wave 1 built the domain; Wave 2 only wires it to the phone and the screen. Do not reimplement domain logic in UI code; call the domain functions (office actions) or the tools (agent).
- Stack facts: Next 16 App Router (route `params` are Promises; `middleware.ts` guards pages; use server components + server actions; `getCurrentUser()` / `requireUser()` from `src/lib/auth.ts`; `actorFromUser(user)` gives the event actor), Tailwind v4 + shadcn/ui components already installed in `src/components/ui`, zod v4, Drizzle. Business time zone helpers in `src/lib/time.ts`; everything shown to the office is Eastern Time.
- Live updates: subscribe to `GET /api/events/stream?since=<id>` (SSE, JSON rows). Build one small client hook `useLiveEvents(filter)` in `src/lib/use-live-events.ts` if it does not exist yet; if another unit already created it, reuse it unchanged.
- Visual bar: clean, dense, operational. Neutral palette, one accent for the agent (badge "Agent"), status colors: scheduled blue, in progress amber, complete green, canceled gray, pending cancellation striped red, needs scheduling purple. No marketing fluff. Mobile-usable but desktop-first.
- Do not commit or push; do not run git stash/checkout/reset; stay inside the files you own; never print secrets. Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` before reporting.
- Report back under 300 words: what shipped, how verified (include a screenshot path if you took one via the running dev server), deviations, risks, files created/changed.

## You own
`src/components/inbox/cancellation-approval.tsx`, `src/app/inbox/cancellations/**` (optional dedicated page), `src/app/api/change-requests/**` if needed, server actions in `src/app/inbox/actions.ts`, tests. Depends on W1-B (`approveCancellation`, `rejectCancellation`, `requestCancellation`), W1-F (`isAdmin`), W2-A (`calls.transcript`).

## Deliverables
1. The approval card: job (invoice number, window, tech, customer, address), the reason the agent recorded, the **transcript excerpt** from `change_requests.transcript_ref` (`{from,to}` indices into `calls.transcript`; show 3 messages before for context, highlight the request), a link to the full call and recording, requested time, elapsed time since request.
2. Approve → `approveCancellation` (job to `user canceled`, task done, event `job.cancellation_approved` with the admin's name). Reject → requires a note → `rejectCancellation` (restores `previous_status`, creates a callback task, event `job.cancellation_rejected`). Buttons only for `isAdmin(user)`; others see "Awaiting admin approval" and who can approve.
3. Pending cancellations must be visible where the office looks: the Today board card and the job page show a striped red "Pending cancellation" state (W2-B/W2-D render it; you provide a tiny shared `PendingCancellationBadge` in `src/components/inbox/pending-badge.tsx` and tell the coordinator).
4. Agent side: confirm the `request_cancellation` tool's `speech_hint` says the office will confirm and that nothing is canceled yet; if it does not, report the exact wording change needed (do not edit W1-B files).
5. Live: approval/rejection appears on the board within 2 s through the events feed.

## Acceptance
- Test: as `grader` (admin) approve a fixture request → job canceled, event actor label is the grader's name; as an `office` user the buttons are absent and the server action returns 403.
- Test: reject restores the exact previous status and creates the callback task.
