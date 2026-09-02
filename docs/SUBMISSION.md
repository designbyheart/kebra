# Submission checklist (final hour)

Work top to bottom. Nothing here touches code; it is operations and a send.

## 1. Data and intelligence

- [ ] Add Anthropic credit (~$5.25 needed), then `pnpm dossiers` to finish the 291 address + 119 customer rows; confirm the per-batch log in `receipts/claude-dossiers.md` gained rows and update the total there and in the README costs table.
- [ ] `pnpm dossiers -- --copy-to-env RAILWAY_DATABASE_URL` to mirror the new rows to production.
- [ ] Spot-check 3 dossiers on production `/addresses/[id]` against their notes.

## 2. Live end-of-call check

- [ ] Make one short call (web or phone), hang up, open `/calls/[id]`: summary, outcome, promises and needs_review appear without manual action (webhook path). If not, `pnpm analyze-calls` against production and note the gap.
- [ ] Confirm `call.analyzed` shows in the activity strip and a `review` task opens only for unbacked promises.

## 3. Phone QA

- [ ] Run `docs/QA.md` scenarios 1 to 8 on +1 (934) 647-8409, and scenario 1 once more via `/call`.
- [ ] Verify `OFFICE_HANDOFF_NUMBER` is set on the Railway service and `pnpm vapi:sync --app-url https://kebra-web-production.up.railway.app` was re-run after it, so scenario 6b actually transfers. If it is deliberately unset, scenario 6b must end in a handoff task and the README wording ("task-only handoff") stays.
- [ ] Note p95 tool latency from Railway logs (`ms` on tool-calls) and any wrong statement verbatim; fix prompt wording if needed and re-sync.

## 4. Clean production

- [ ] Remove test fixtures on production: `pnpm exec tsx src/db/seed-cancellation-fixture.ts --clean` and `pnpm db:seed-calls --clean` with `DATABASE_URL` pointed at Railway. Check `/calls`, `/inbox` and `/today` show only real calls and imported or agent-created jobs.
- [ ] Cancel or leave in place any jobs booked during QA (a few real agent bookings on the board are fine and show the feature; delete obvious junk).
- [ ] Delete the Railway Postgres TCP proxy: `railway tcp-proxy delete <id>` (coordinator has the id). Re-run `curl https://kebra-web-production.up.railway.app/api/health` afterwards to confirm `db: true`.
- [ ] Confirm the grader account works on production (`grader@...`, role admin) and can approve a cancellation.

## 5. Repo

- [ ] `git status` clean; no `.env`, `docs/CREDENTIALS.local.md`, or dumps tracked (`.gitignore` covers them, verify with `git ls-files | grep -i -E 'env|credential'`).
- [ ] Make the GitHub repo public, or add the reviewers as collaborators if it stays private.
- [ ] README links (phone, `/call`, platform URL) resolve.

## 6. Number stays live 24 h

- Vapi free numbers: docs at https://docs.vapi.ai/free-telephony (checked 2026-09-02) say the number is free, inbound-only, US national calling only, one number without a saved payment method (up to five with one), and calls are billed at standard rates. The page states no expiry, inactivity reclaim, or daily call cap, so **no action is needed to keep the number live**. Unverified: third-party mentions of daily caps on free numbers.
- [ ] Mitigations anyway: keep a payment method on the Vapi account with credit above ~$10 (about 3 h of calls), and keep `/call` working as the fallback the brief allows.
- [ ] Do not stop the Railway service or rotate `VAPI_WEBHOOK_SECRET` during the window; the number is routed to `/api/voice/webhook` (assistant-request), so the app must stay up for calls to answer.
- [ ] Optional: a `/loop` or cron that hits `/api/health` every 10 minutes for the 24 h and alerts on failure.

## 7. Submission email (draft)

Subject: Kebra take-home — Gulf Breeze Air front desk

Hi [name],

Here is my submission for the front-desk assignment.

- Phone: +1 (934) 647-8409 (US number; inbound only). Live for at least 24 hours from this email.
- Web call, if you are outside the US or prefer the browser: https://kebra-web-production.up.railway.app/call
- Platform: https://kebra-web-production.up.railway.app
  Login: [grader email] / [password] (admin role, so you can approve the cancellation flow in Inbox).
- Repo: [GitHub URL]. The README explains how the agent and the platform fit together, what to try on the phone, the design decisions, and how to run it. `docs/QA.md` is the call script I tested against.

Suggested 10 minutes: keep Today and Calls open, call and say "my upstairs unit is frozen, I'm at 3284 Harborlight Hollow", then try "what did we do last time at 103 Grouper Landing", a weather or model-number question, "I want to cancel Thursday" (watch Inbox), and "I smell gas" (handoff).

Costs so far (receipts in `receipts/` in the repo):
- Claude (Opus 5 batch dossiers + end-of-call analysis): $[22.15 + remainder]
- Vapi: number free; call minutes $[total after QA]
- Railway Hobby plan: ~$5/month
- Tavily: free tier

Happy to walk through any of it.

[name]
