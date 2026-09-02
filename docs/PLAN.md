# Gulf Breeze Air — Front Desk Agent + Office Platform

**Build plan v1 — for review together before any code is written.**
Prepared 2026-09-02. Deadline: 2026-09-03 (submission: phone number + platform URL + repo).

---

## 0. TL;DR

We build **one product with two faces**: a voice agent ("Brianna", the Gulf Breeze Air front desk) on a real phone number, and a web platform ("the office") where the same data lives, where the office runs the day, and where every call and every agent action lands live.

The single most important architectural idea: **the agent never touches data directly. It calls the same platform API the office UI uses.** One tool contract, one audit trail, one event stream. That is what makes "see it land on screen while we're still on the phone" trivially true, and it is what the brief says they are mostly looking at ("how the two fit together").

Stack recommendation (fast path for 24h, all tooling already on this machine):

| Layer | Choice | Why |
|---|---|---|
| Voice | Managed voice platform (Vapi, runner-up Retell) with server-side tool webhooks | Real number in minutes, browser web-call fallback built in, transfer-to-human built in, we only write tool handlers |
| LLM | Claude Sonnet 5 as the voice brain, selected natively inside Vapi (Opus 5 is not in Vapi's catalog; running it ourselves is the alternative in D3); `claude-opus-5` via the Batch API for offline dossier generation and the end-of-call pass | Best reasoning over messy tech notes where latency doesn't matter; batch is 50% cheaper for the one-time job |
| Platform | Next.js (App Router, TypeScript) on Railway | `railway` CLI present, persistent container for SSE, Dockerfile deploy, API routes = tool webhooks |
| DB | Postgres 16 in Docker locally, Railway Postgres in production, Drizzle ORM, `pg_trgm` for fuzzy address search | Data is relational and small (2k jobs); fuzzy match is essential for spoken addresses |
| Live updates | Server-Sent Events from an `events` table (poll fallback) | No extra vendor, good enough for a demo, trivially observable |
| Web tools | Tavily (or Brave) search + Open-Meteo weather (no key needed) | Cheap, fast, satisfies "some kind of live web tool" |
| Dev tunnel | `cloudflared` (already installed) | Webhooks need a public URL before first deploy |

---

## 1. What the brief is really testing

Read literally, the brief asks for 4 agent capabilities and an open-ended platform. Read as an evaluator, they will dial the number and try to break it in ~10 minutes, then open the platform and see whether what they were promised shows up. We design to that.

**The owner's five complaints are the acceptance criteria:**

| Complaint | What must be true |
|---|---|
| "can't tell a customer when we were last out there" | Agent answers address/customer history in one turn, from tech notes, not a search result |
| "can't tell them if they're under warranty" | Agent gives a warranty answer with a stated basis (install date, tags, warranty line items) and hands off when ambiguous |
| "can't move an appointment" | Agent finds the booking, offers real open slots, reschedules; board updates live |
| "I have no idea what it promised anyone" | Every call has a record: transcript, summary, actions taken, promises made, follow-ups flagged |
| "it's pretty slow" | Sub-second tool responses, filler speech during lookups, short answers, no monologues |

**Demo script we build toward** (these become the QA scenarios):

1. **Homeowner, upstairs frozen.** "My upstairs unit is frozen, I'm at 3284 Harborlight Hollow." Agent finds address, sees prior visits, checks warranty, books earliest slot with the right tech, confirms window, notes arrive on the board mid-call.
2. **Property manager, guests at four.** "This is Starfish Hospitality, 10254 East Old Mangrove unit 36W, AC out, checkin at 4." Agent recognizes the company, disambiguates the unit, treats as priority, checks who is free this afternoon, books, adds gate/access note request, offers to text a confirmation.
3. **Owner: "what's my day look like."** Agent summarizes today's board: count, techs, open callbacks, anything in-progress, outstanding balances if asked.
4. **Tech: "what did we do last time at 89 Harborlight Shores."** Agent reads back the last visit summary, parts installed, open issues.
5. **Outside the data.** "Is it going to rain this afternoon, I've got an attic job in Homestead." / "What's the tonnage on a Trane 4TTR4036?" → web tool.
6. **Handoff.** "I want to dispute this invoice" / "I smell gas" / "Let me talk to a person" → transfer, with a task on the platform if nobody answers.

---

## 2. Architecture

```
                      PSTN / browser web-call
                               │
                    ┌──────────▼───────────┐
                    │  Voice platform      │  STT ─ LLM ─ TTS, interruption,
                    │  (Vapi)              │  transfer, recording
                    └───┬──────────────┬───┘
      tool-call webhooks│              │ status / transcript / end-of-call webhooks
                        ▼              ▼
   ┌────────────────────────────────────────────────────────┐
   │  Platform (Next.js on Vercel)                          │
   │                                                        │
   │  /api/agent/tools/*   ← the ONE tool contract          │
   │  /api/voice/webhook   ← call lifecycle → calls table   │
   │  /api/events/stream   ← SSE feed for the UI            │
   │  domain/  (availability, booking, warranty, dossier)   │
   │  app/     (Today board, Calls, Customers, Jobs, Inbox) │
   └───────────────┬────────────────────────────────────────┘
                   │
          ┌────────▼────────┐        ┌──────────────────┐
          │ Postgres        │        │ Web tools        │
          │ jobs, notes,    │        │ Tavily, Open-Meteo│
          │ customers,      │        └──────────────────┘
          │ addresses,      │
          │ employees,      │        ┌──────────────────┐
          │ invoices, calls,│        │ Claude (batch)   │
          │ call_actions,   │◄───────│ address dossiers │
          │ events, tasks   │  once  └──────────────────┘
          └─────────────────┘
```

**Design rules**

1. **Tools are the API.** Every capability the agent has is a typed endpoint under `/api/agent/tools/`. The office UI uses the same domain functions. No agent-only code paths that mutate data.
2. **Every mutation writes an event.** `events(actor, type, entity, payload, call_id)`. The UI subscribes; the Calls page shows a per-call action list derived from it.
3. **Every call is a first-class record.** `calls(id, started_at, caller, direction, status, transcript, summary, outcome, handoff_reason, promised[])`. Started on the first webhook, enriched live, finalized by the end-of-call report.
4. **Answer, don't search.** Precomputed per-address and per-customer dossiers (last visit, equipment, recurring issues, warranty facts, open balance, access notes) so the voice agent gets one compact blob in one call. Raw notes stay available as a second tool for follow-ups.
5. **Latency budget per tool call: < 800 ms** server side. Vapi speaks a filler ("let me pull that up") while waiting.
6. **Time zone discipline.** Data is UTC; the business is `America/New_York`. All availability math and all spoken times in ET. "Today" for the demo is the real date, and it lines up with the data (last real job 2026-09-01, 38 jobs already scheduled 09-02 → 09-15). We keep that as-is; it makes the board look alive on demo day.

---

## 3. Decisions to make together (my recommendation first)

| # | Decision | Recommendation | Alternatives | Needed from you |
|---|---|---|---|---|
| D1 | Voice platform | **Vapi** — free US number instantly with no KYC, server-URL tools with spoken filler, live `transcript`/`tool-calls` webhooks, end-of-call report with recording, public-key web widget, warm transfer with no-answer fallback (verified, §12) | Retell (slightly better latency, but number purchase is KYC-gated and web calls need a token backend), ElevenLabs (no native number purchase, no live webhooks, 15 free min), DIY Twilio + Realtime (too much for 24h) | Vapi account (card optional; $10 signup credit) |
| D2 | Where the LLM runs | **Inside the voice platform**, selecting a Claude model; our server only implements tools | "Custom LLM" endpoint where we run Claude ourselves (full control, one extra hop, more code) | Agree or override |
| D3 | Voice LLM model | **Claude Sonnet 5 natively inside Vapi** (Vapi's catalog today: Opus 4.6, Sonnet 5, Haiku 4.5; Opus 5 is not selectable natively). Our own server-side code (dossier batch, end-of-call pass) uses `claude-opus-5` | Run `claude-opus-5` ourselves behind Vapi's OpenAI-compatible Custom LLM endpoint: best reasoning, but one more network hop and ~3h extra build. Haiku 4.5 if measured turn latency is unacceptable. Your call | Anthropic API key (Vapi can use its own key at cost, or ours) |
| D4 | Hosting | **Decided: Railway for both app and Postgres.** Local dev uses the same Postgres image via `docker-compose.yml` (pgvector/pg16, port 5433, `pg_trgm` + `vector` enabled). Railway's persistent container also suits the long-lived SSE connections better than serverless | Vercel + Neon (original recommendation; SSE on serverless is fragile) | Railway login (CLI present) |
| D5 | Auth on platform | **Decided: named logins.** Email + password, `users` table seeded from the office staff in the data (Alina, Audrey, Zoe, Ray, Logan, Andre as admins; Sonia as office; plus an owner account), bcrypt hashes, signed httpOnly session cookie, middleware guard. Actor on every event is the logged-in user. A grader account is included in the submission | — | Initial passwords (or I generate and put them in the submission notes) |
| D6 | Live updates | SSE from events table, 2s poll fallback | Supabase Realtime, Pusher | none |
| D7 | Web search | Tavily free tier | Brave Search API, Exa | Tavily key |
| D8 | Handoff target | Your mobile number as "the office" during the 24h live window; if no answer in 20s, create an Inbox task and tell the caller | A second Vapi assistant as "voicemail" | Your number |
| D9 | Caller identity | **Decided: yes.** Data has no phone numbers. Agent identifies by **address or name + confirms**, then saves the caller's number on the customer record (`customer_phones`: number, label, source `agent|office`, first_seen). Returning callers are greeted by name and their sites are pre-loaded via the assistant-request webhook | — | — |
| D10 | Repo | New GitHub repo (private until submit, then share) | Public | Repo name |
| D12 | Cancellations | **Decided: admin approval, transcript-referenced.** The agent never cancels directly. `request_cancellation` puts the job in `pending_cancellation`, tells the caller the office will confirm, and creates an Inbox item visible to everyone but approvable only by `admin`/`owner` users. The approval screen shows the job, the caller, and the exact transcript passage where the cancellation was requested (linked to the full call). Approve → job canceled with an event naming the admin and the call; reject → job restored, follow-up task created. Reschedules stay immediate. Optional stretch: also email the caller a confirmation copy | Customer self-confirmation by emailed link (needs a verified sending domain) | — |
| D11 | Scope guard | Everything in §6 MVP; §6 "cut" list not attempted before the MVP is live and tested | — | Agree |

---

## 4. Data model (Postgres, via Drizzle)

Imported 1:1 from the JSONL with a few derived tables. Money stays in cents.

**Core (from data)**
- `customers` (id, first_name, last_name, company, kind, display_name, phone nullable, job_count, first_job, last_job)
- `addresses` (id, customer_id, street, unit, city, state, zip, lat, lng, normalized_street, search_text) — `pg_trgm` GIN index on `search_text`
- `employees` (id, first, last, role, jobs, active, phone nullable)
- `jobs` (id, invoice_number, description, work_status, scheduled_start, scheduled_end, arrival_window, on_my_way_at, started_at, completed_at, tags[], total_amount, outstanding_balance, customer_id, address_id, created_at, updated_at, canceled_at, source: `import|agent|office`)
- `job_assignments` (job_id, employee_id)
- `notes` (id, job_id, content, author_type `tech|office|agent`, created_at, seq)
- `invoices`, `invoice_items` (as-is)

**Derived / platform**
- `address_dossiers` (address_id, summary_md, last_visit_at, last_visit_summary, equipment[], warranty jsonb, open_issues[], access_notes, recurring_issues[], generated_at)
- `customer_dossiers` (customer_id, summary_md, sites_count, open_balance, preferences, generated_at)
- `calls` (id, provider_call_id, direction, started_at, ended_at, caller_number, matched_customer_id, matched_address_id, status, transcript jsonb, summary, outcome, promises jsonb[], handoff_reason, recording_url, needs_review bool)
- `events` (id, ts, actor `agent|office|system`, call_id nullable, type, entity_type, entity_id, payload jsonb) — the live feed
- `tasks` (id, kind `callback|handoff|review|followup|cancellation`, status, title, body, customer_id, job_id, call_id, due_at, assigned_to)
- `change_requests` (id, job_id, kind `cancel`, status `pending|approved|rejected`, reason, call_id, transcript_ref (message index range in the call transcript), requested_at, resolved_at, resolved_by user_id, resolution_note)
- `users` (id, email, name, role `owner|admin|office|tech`, password_hash, employee_id nullable, last_login_at) — seeded from `employees` where role is admin/office staff, plus an owner and a grader account
- `business_hours` / `service_types` — small config tables (durations by service type, hours Mon-Sat 8-6 ET default; data shows first starts ~9-10am, last ~8pm, Sat/Sun lighter)

**Warranty derivation (computed, cached on dossier, explained to caller)**
- Labor: install job (`System Installation` family) within 12 months, or tag `1 Yr Labor Warranty` → labor covered until install + 1y.
- Parts: manufacturer warranty tracked via tags `Registration Complete` (10y registered typical) / `Registration Needed` (5y unregistered typical) and invoice lines `WARRANTY Parts / Service - WARRANTY - <part>`. We state the basis and the caveat; anything not clear-cut → "let me have the office confirm" + task.
- Callback tags (`Service Callback`, `Install callback (...)`, `Warranty Claim`) surface as "open issue" context.

---

## 5. The agent tool contract (shared by voice + UI)

All `POST /api/agent/tools/<name>`, JSON in/out, auth via shared secret header from the voice platform. Each returns a `speech_hint` (one short sentence the model can read) plus structured data.

**Lookups (read)**
- `find_address(query, unit?)` → fuzzy candidates with confidence; asks to confirm when < 0.85
- `find_customer(name | company | phone)` → candidates
- `get_address_dossier(address_id)` → the precomputed answer to "when were you last here and what did you do"
- `get_job(invoice_number | job_id)` → status, window, tech, notes summary
- `get_visit_history(address_id, limit)` → chronological visits with one-line summaries
- `check_warranty(address_id)` → status + basis + caveats
- `get_schedule(date, employee_id?)` → the board; used for "what's my day"
- `find_availability(date_range, service_type, priority?, preferred_tech?)` → open slots as 2h windows with tech
- `get_open_balance(customer_id)`

**Actions (write, each emits an event and appends to the call's action list)**
- `book_job(address_id, customer_id, service_type, window_start, employee_id, issue_summary, priority)` → creates `jobs` row (status scheduled, source agent) + booking note
- `reschedule_job(job_id, new_window_start, reason)`
- `request_cancellation(job_id, reason)` → job to `pending_cancellation`, `change_requests` row pointing at the current call and transcript position, Inbox item for admins. There is no direct `cancel_job` tool for the agent; admins cancel from the approval screen
- `add_note(job_id | address_id, content)`
- `create_task(kind, title, body, customer_id?, job_id?, due_at?)` → callback / follow-up / review
- `save_caller_phone(customer_id, phone)`

**Outside the data**
- `web_search(query)` (Tavily) → top 3 snippets
- `get_weather(city | lat,lng, when)` (Open-Meteo)

**Control**
- `transfer_to_office(reason)` → platform's native transfer to D8 number; on failure → `create_task(handoff)` and tell caller
- `end_call_summary` is not a tool; the end-of-call webhook produces it

**Voice webhook** `/api/voice/webhook` handles: assistant-request (inject date/time, business hours, caller-number match if known), status-update, transcript (live), tool-calls (dispatch to the above), end-of-call-report (transcript, summary, recording, then a Claude pass to extract `promises[]`, `outcome`, `needs_review`).

---

## 6. Platform scope

**MVP (must be live before submission)**
1. **Today** — dispatch board: techs × time (ET), jobs as cards with status color, arrival window, address, customer; live updates; date switcher; "unassigned / needs scheduling" lane. New bookings from the agent slide in with an "agent" badge.
2. **Calls** — list of calls (live ones pulsing), each with: caller, matched customer/address, duration, outcome, actions taken (from events), promises made, transcript, recording, "needs review" flag, and a one-click "create task / reschedule" from the transcript. This is the direct answer to "I have no idea what it promised anyone".
3. **Customers & addresses** — search, then a dossier page: header (kind, sites, balance), timeline of visits with summaries and full notes on expand, equipment & warranty panel, invoices with line items, upcoming jobs.
4. **Jobs** — list with filters (status, tech, date, tag), job detail with notes (add note), reschedule/cancel/assign (same domain functions the agent uses).
5. **Inbox** — tasks: handoffs, callbacks, reviews. Assign / resolve.
6. **Talk to the agent** button — the voice platform's web-call widget embedded in the platform (grader fallback + our own testing loop).
7. Activity strip on every page: last N events, live.

**Nice, only after MVP is deployed and smoke-tested**
- Tech schedule per-person view / map of today's stops (we have lat/lng)
- Owner dashboard: revenue MTD, outstanding balance ($655k in the data), callbacks rate
- Outbound confirmation email/SMS to callers (booking and cancellation copies)
- Editable business hours / service durations UI

**Explicitly cut**
- Self-service signup, password reset flows, fine-grained permissions, mobile app, invoice editing, payments, editing historical notes.

---

## 7. Voice agent design

**Persona & style.** Front desk for Gulf Breeze Air. Warm, brisk, Miami office energy. Short sentences. Confirms specifics back (address, unit, window, tech first name). Never invents facts: if a tool returns nothing, says so and offers next step.

**Identification flow.** Ask "what's the service address?" first (addresses are the strongest key in this data; company customers have dozens of sites). Fuzzy match → read back the best candidate ("3284 Harborlight Hollow Lane in Coral Gables?"). For known property-management companies, ask for unit. Fall back to name/company. Offer to save the number for next time.

**Booking flow.** Issue → urgency triage (no cooling in September heat with guests = priority) → `find_availability` (prefers tech who was last on site, then load-balanced) → offer 2 windows → confirm → `book_job` → read back confirmation → ask about access (gate/door code goes into a note, never spoken back).

**Handoff triggers (hard rules in the prompt).** Safety (gas smell, burning, sparks, active water leak into electrical) → say what to do + transfer immediately. Billing disputes, pricing negotiations, complaints about a tech, anything legal/insurance, caller asks for a human twice, or three failed identification attempts → transfer; no answer → task + promise a callback with a time.

**Guardrails.** Don't quote prices beyond dispatch fee tiers visible in the price book. Don't read door codes aloud. Don't promise same-day if no slot exists. Don't discuss other customers.

**Latency.** Tool responses < 800 ms (dossiers precomputed, indexes on everything spoken), filler phrases on every tool, `max_tokens` small, one tool per turn where possible.

---

## 8. Work breakdown — units designed for separate sub-agent sessions

Each unit is self-contained: it states its inputs, the files it owns, the acceptance test, and what it must not touch. The coordinator (this session) owns `docs/`, the schema file, and the tool contract; sub-agents build against them. Units in the same wave run in parallel.

| ID | Unit | Wave | Depends on | Owner type | Est. | Deliverable / acceptance |
|---|---|---|---|---|---|---|
| **W0-A** | Repo scaffold + deploy skeleton | 0 | — | coordinator | 45m | Next.js TS app, Drizzle, Dockerfile, deployed to Railway with `/api/health` green; `.env.example`; `cloudflared` script for local webhooks |
| **W0-B** | Schema + tool contract frozen | 0 | — | coordinator | 45m | `db/schema.ts`, `docs/TOOLS.md` (request/response shapes), `docs/EVENTS.md` |
| **W1-A** | Data import | 1 | W0 | fresh agent | 1.5h | `scripts/import.ts` loads all JSONL idempotently; address normalization + `pg_trgm` index; row counts match README (1,992 / 6,954 / 1,700 / 732 / 23); fuzzy `find_address` returns the right row for 20 spoken-style variants |
| **W1-B** | Domain: availability, booking, reschedule, cancel, notes, tasks, events | 1 | W0 | fresh agent | 2.5h | Pure functions in `domain/` + tool routes; unit tests for availability (no double-booking, hours, ET, arrival windows); every write emits an event |
| **W1-C** | Domain: warranty + history + schedule summary | 1 | W0 | fresh agent | 1.5h | `check_warranty`, `get_visit_history`, `get_schedule` day summary; tested against 10 hand-picked jobs (install jobs, warranty claims, callbacks) |
| **W1-D** | Dossier generation (Claude Batch) | 1 | W1-A | fresh agent | 2h build, ~1h run | `scripts/dossiers.ts`: per-address + per-customer summaries via Message Batches, structured output schema, idempotent, resumable; spot-check 15 addresses for faithfulness; cost logged |
| **W1-E** | Web tools | 1 | W0 | fresh agent | 45m | `web_search`, `get_weather` routes with caching and timeouts |
| **W1-F** | Auth: named office logins | 1 | W0 | fresh agent | 1.5h | Login page, session cookie, middleware, `users` seed from office staff, `currentUser()` helper used as event actor; agent webhooks authenticate by shared secret, not session |
| **W2-A** | Voice: assistant config + prompt + webhook | 2 | W1-B, W1-C | fork (needs context) | 3h | `voice/assistant.json` pushed via API script; `/api/voice/webhook` handles all event types; `calls` rows created/enriched/finalized; transfer + fallback task; number provisioned; web-call widget page |
| **W2-B** | UI: Today board + activity strip + SSE | 2 | W1-A, W1-B | fresh agent | 3h | Live board in ET, new/moved jobs animate in, agent badge |
| **W2-C** | UI: Calls page | 2 | W2-A schema | fresh agent | 2h | List + detail, live transcript, actions, promises, review flag |
| **W2-D** | UI: Customers/addresses + Jobs + Inbox | 2 | W1-A, W1-C | fresh agent | 3h | Dossier page, job detail with notes/reschedule, task inbox |
| **W2-E** | Cancellation approval workflow | 2 | W1-B, W1-F, W2-A | fresh agent | 1.5h | `pending_cancellation` state on board and job detail, Inbox approval screen gated to admin/owner, transcript excerpt rendered inline with link to the full call, approve/reject with events, agent prompt wording for "the office will confirm" |
| **W3-A** | End-of-call intelligence | 3 | W2-A | fresh agent | 1h | Claude pass on transcript → summary, promises, outcome, needs_review; shown on Calls page |
| **W3-B** | QA run of the 6 demo scenarios | 3 | all W2 | coordinator + you on the phone | 1.5h | Scripted checklist in `docs/QA.md`, every scenario passes on the real number and on web-call |
| **W3-C** | README, receipts, submission | 3 | W3-B | coordinator | 45m | README with architecture, how to run, costs table with receipts, known gaps; number live 24h |

Wave 1 can run 4–5 agents in parallel; Wave 2 runs 4 in parallel. Coordinator gates each wave: reviews diffs, runs tests, merges, redeploys.

**Critical path:** W0 → W1-B → W2-A → W3-B. Everything else has slack. If time gets tight, W2-D shrinks to Customers dossier page only, W1-D falls back to a deterministic (non-LLM) dossier built from notes (last visit, tags, items) and the LLM summary becomes an enrichment.

---

## 9. Timeline (24h, starting after this review)

| Block | Hours | What |
|---|---|---|
| Review + accounts | 0–1 | This document, decisions D1–D11, keys, number provisioned, repo created |
| Wave 0 | 1–2 | Scaffold deployed, schema + tool contract frozen |
| Wave 1 | 2–6 | Import, domain logic, dossiers (batch running in background), web tools |
| Wave 2 | 6–13 | Voice agent live on the number against real tools; UI pages |
| Buffer / sleep | 13–17 | Batch dossiers finish; coordinator reviews and merges |
| Wave 3 | 17–21 | End-of-call intelligence, QA on the phone, fixes |
| Polish + submit | 21–24 | README, receipts, final deploy, keep number live 24h |

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Voice platform account or number provisioning delayed (KYC) | Do it in hour 0. Fallback per brief: web call from the platform, which we build anyway |
| Tool latency makes the agent "slow" (the owner's complaint) | Precomputed dossiers, indexes, warm DB connection, filler speech, measure p95 in W2-A; drop to a faster model only if measured |
| Spoken addresses don't match (`10254 E Old Mangrove Rd` has 8+ units) | Trigram search + unit prompt + read-back confirmation; company customers get unit-first flow |
| Double-booking or wrong-timezone bookings | Availability engine with tests; all display in ET; arrival window = 120 min default |
| Agent promises what it can't do | Tools return explicit `speech_hint`s; prompt forbids promising outside tool results; end-of-call pass flags `needs_review` |
| Data ambiguity: README says calendar through end of year, data shows scheduled through 09-15 | Fine for demo; mention in README |
| `.docx` vs `.md` brief drift | Checked: same content |
| Cost overrun | Estimated < $60 total: Vapi number free, minutes ≈ $0.05 + providers (covered largely by the $10 credit), Claude batch dossiers ≈ $15–30, Tavily free, Railway hobby plan ≈ $5. Receipts folder in repo |
| Deadline | MVP lines are drawn in §6; Wave 3 polish is optional; the number + board + calls page is the irreducible demo |

---

## 11. Setup checklist (you, hour 0)

- [x] Vapi account, keys in `.env` (verified). Free number claimed 2026-09-02: **+1 (934) 647-8409** (Miami area codes were not available in Vapi's free pool; cosmetic, can be swapped for a Twilio 305 import later)
- [x] Anthropic API key with billing (verified: Opus 5 and Sonnet 5 available)
- [x] Local Postgres via `docker compose up -d` (`DATABASE_URL` set in `.env`)
- [ ] Railway login (`railway login`) and a project with a Postgres service for production
- [ ] Tavily API key
- [ ] (optional, stretch) Resend account + verified domain if we want to email callers a cancellation confirmation copy
- [ ] Your mobile number for handoff (D8); initial office passwords or let me generate them (D5)
- [ ] GitHub repo name (D10)
- [ ] A `receipts/` folder we fill as we go

---

## 12. Voice platform research (verified 2026-09-02)

A research pass checked current docs for Vapi, Retell and ElevenLabs Agents. Summary:

| Criterion | Vapi | Retell | ElevenLabs Agents |
|---|---|---|---|
| Real US number | Free, instant, no KYC, inbound-only; 1 without card, up to 5 with card | $2/mo, requires KYC (instant or Persona ID check) | No native purchase; bring Twilio/SIP |
| Server tools | Custom Tools → `server.url`, 20s default timeout, spoken filler on request-start and on delay | Custom Function, "talk while waiting", 2-min default timeout | Webhook tools, 20s default, execution modes |
| Claude natively | Opus 4.6, Sonnet 5, Sonnet 4.6, Haiku 4.5 | Sonnet 4.6, Haiku 4.5 | Opus 4.8/4.7, Sonnet 5, Haiku 4.5 |
| Custom LLM | OpenAI-compatible HTTP endpoint | WebSocket protocol only | OpenAI-compatible |
| Browser call | `@vapi-ai/web` + widget, public key, no backend | JS SDK, needs server-minted 30s token | Widget, zero backend |
| Transfer | Blind + warm; experimental warm transfer detects no-answer/voicemail and returns to the assistant | Cold/warm, 30s ring timeout, cancel-or-bridge | Warm/blind; no-answer handling unverified |
| Webhooks | `status-update`, `transcript` (partial + final), `tool-calls`, `end-of-call-report` with recording | call_started, transcript_updated, call_ended, call_analyzed | Post-call only; live needs monitoring WebSocket |
| Pricing | $0.05/min platform + providers at cost; number free; $10 signup credit | ≈ $0.11–0.17/min all-in; $2/mo number; $10 credit | $0.08/min + LLM; free plan 15 min/month |
| Latency (third-party) | ~720 ms median | ~650 ms median | 400–800 ms |

Sources: docs.vapi.ai (free-telephony, tools/custom-tools, providers/model/anthropic, call-forwarding, server-url/events, quickstart/web, pricing), docs.retellai.com (purchase-number, kyc, custom-function, transfer-call, webhook, web-call, pricing), elevenlabs.io/docs (phone-numbers, server-tools, llm, widget, post-call-webhooks, pricing).

Adjacent facts: Twilio trial accounts cannot buy numbers until upgraded, but US local numbers need no regulatory bundle. Neon free tier: 0.5 GB, 100 compute-hours/month, no card, scale-to-zero without pausing. Supabase free tier auto-pauses after 7 idle days.

Unverified: whether Vapi's free number has a daily call cap (third parties mention limits; docs don't state one). Mitigation: put a card on the account, and the platform's embedded web-call is always available as a fallback.

**Conclusion for D1/D2:** Vapi, with the LLM running inside Vapi and our server implementing tools. Runner-up Retell, only if Vapi's number provisioning fails for some reason.

## 13. Open questions for you

1. Any preference on voice platform or model beyond my recommendation?
2. Will you be reachable on your mobile during the 24h live window for the handoff demo, or should handoff go to voicemail-style capture only?
3. (resolved) Cancellations are approved by admins in the platform with the transcript passage attached; emailing the caller a copy is a stretch goal.
