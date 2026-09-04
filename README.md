# Gulf Breeze Air front desk (Kebra take-home)

A voice agent ("Brianna") that answers Gulf Breeze Air's phone, and the office platform behind it, built on the six months of Housecall Pro data in `front-desk-assignment/data`. The agent answers history and warranty questions from the tech notes, books and moves visits, files cancellations, checks weather and the web, and hands off to a person. Everything it does lands on the office screen while the call is still going.

- **Phone:** +1 (934) 647-8409 (US callers; live for at least 24 h after submission)
- **Web call (no phone needed):** https://kebra-web-production.up.railway.app/call
- **Platform:** https://kebra-web-production.up.railway.app — login credentials are in the submission email

## How the two pieces fit

The agent never touches the database. Every capability it has is a typed endpoint under `/api/agent/tools/<name>`, and the office UI calls the same domain functions underneath. Every write emits one `events` row; the live activity strip, the per-call "actions taken" list and the audit trail are views over that table. Every call is a first-class record from the first webhook to the end-of-call analysis. Per-address and per-customer dossiers are precomputed, so "when were you last here" is one tool call, not a search. Cancellations are never final on the phone: the agent files a request an admin approves with the transcript passage in front of them. Safety issues, billing disputes and "get me a person" transfer to the office, or open a handoff task if nobody picks up.

```
              PSTN / browser web-call
                        │
             ┌──────────▼───────────┐
             │ Vapi                 │  STT (Deepgram) · Claude Sonnet 5 · TTS
             │ assistant as code    │  filler speech, transfer, recording
             └───┬──────────────┬───┘
   tool-calls    │              │ assistant-request, transcript,
   webhooks      ▼              ▼ status, end-of-call-report
   ┌─────────────────────────────────────────────────────┐
   │ Next.js 16 on Railway                               │
   │  /api/agent/tools/*   the ONE tool contract         │
   │  /api/voice/webhook   call lifecycle → calls table  │
   │  /api/events/stream   SSE feed for every page       │
   │  src/domain/*         availability, booking, warranty │
   │  /today /calls /customers /jobs /inbox              │
   └──────────────┬──────────────────────────────────────┘
                  │
      ┌───────────▼──────────┐   ┌─────────────────────┐
      │ Postgres 16 (pg_trgm)│   │ Tavily · Open-Meteo │
      │ jobs, notes, calls,  │   └─────────────────────┘
      │ events, tasks, ...   │   ┌─────────────────────┐
      │ address_dossiers ◄───┼───│ Claude Opus 5 batch │
      └──────────────────────┘   └─────────────────────┘
```

## What to try on the phone

Keep **Today** and **Calls** open in two tabs while you call. Full script with expected results: `docs/QA.md`.

- **Homeowner:** "My upstairs unit is frozen, I'm at 3284 Harborlight Hollow." She reads the address back, mentions the July visit and the open callback, offers two real windows with a tech's first name, books, and asks about access. The card appears on Today with an "Agent" badge mid-call.
- **Property manager:** "This is Starfish Hospitality, 10254 East Old Mangrove, unit 36W, AC out, guests at four." She confirms the unit, treats it as priority, books the earliest window, and stores gate details without repeating them.
- **Owner:** "What does my day look like?" One-sentence board summary, detail per tech on request.
- **Tech:** "What did we do last time at 103 Grouper Landing?" March install, labor warranty until March 2027, last maintenance April 30.
- **Outside the data:** "Is it going to rain in Homestead this afternoon?" / "What's the tonnage on a Trane 4TTR4036?"
- **Cancel, hand off, return:** "I want to cancel Thursday" turns the card striped and opens an Inbox approval with the transcript excerpt. "I smell gas" gets a safety instruction, then a transfer. Call back from the same phone and she greets you by name.

## The platform, page by page

| Page | What it is |
|---|---|
| `/today` | Live dispatch board, techs × time in ET, date switcher, unassigned lane; agent bookings slide in with a badge; click a card for the job sheet |
| `/calls`, `/calls/[id]` | Every call: live transcript, tool chips, actions taken (from events), summary, outcome, promises with "backed by an event or not", needs-review toggle, recording |
| `/customers`, `/customers/[id]` | Search, then the customer dossier: sites, balance, visit timeline with expandable notes, upcoming jobs |
| `/addresses/[id]` | The address dossier the agent reads from: last visit, equipment, warranty with evidence, open issues, access notes (masked) |
| `/jobs`, `/jobs/[id]` | Filterable job list; detail with notes, add note, reschedule, assign, cancel, invoice lines |
| `/inbox`, `/inbox/cancellations` | Handoff, callback, review and cancellation tasks; the approval screen shows the transcript passage and is gated to admin/owner |
| `/call` | Public web-call page (Vapi web SDK) for graders without a US phone |
| `/login` | Named office logins; the actor on every event is the logged-in user |

## Architecture and stack

| Layer | Choice |
|---|---|
| Voice | Vapi: free US number, assistant defined in code (`src/voice/assistant.ts`) and pushed with `pnpm vapi:sync`; Deepgram nova-3 STT, Vapi "Savannah" voice |
| Voice LLM | `claude-sonnet-5` inside Vapi, `maxTokens` 250, temperature 0.3; fallbacks Sonnet 4.6 / 4.5 |
| Offline LLM | `claude-opus-5` via Message Batches for dossiers; `claude-opus-5` (effort low) for end-of-call analysis |
| App | Next.js 16 (App Router, TypeScript), Tailwind 4, shadcn/ui, Drizzle ORM, zod, vitest |
| Data | Postgres 16 with `pg_trgm` (fuzzy spoken addresses); Railway Postgres in production, `pgvector/pg16` image locally |
| Live UI | Server-Sent Events over the `events` table (`/api/events/stream`), 1.5 s poll behind it |
| Web tools | Tavily search, Open-Meteo weather (no key), both cached with timeouts |
| Auth | bcrypt + signed httpOnly session cookie; webhooks authenticate with shared secrets, never cookies |
| Hosting | Docker (Next standalone) on Railway, health check `/api/health` |

### The tool contract (`src/agent/registry.ts`, full shapes in `docs/TOOLS.md`)

Purposes are condensed from the descriptions the model sees; Vapi's function schemas are generated from the same zod inputs, so prompt and validator cannot drift.

| Tool | Purpose |
|---|---|
| `find_address` | Fuzzy-match a spoken service address to a known site (spoken numbers fine); asks for a unit in multi-unit buildings |
| `find_customer` | Look up a customer by name, company, or phone; fuzzy on names, exact on phone |
| `save_caller_phone` | Save the caller's number on the customer so future calls are recognized |
| `get_address_dossier` | The one-call answer to "when were you last here and what did you do": last visit, equipment, warranty, open issues, balance, upcoming |
| `get_visit_history` | Older completed visits, newest first, one line each |
| `get_job_notes` | Every note on one job, redacted, for "what exactly did the tech write" |
| `get_job` | One job by id or the 4-digit invoice number staff quote |
| `check_warranty` | Labor and parts coverage with the evidence behind it; flags when the office must confirm |
| `get_open_balance` | What a customer owes, per job; never negotiated on the phone |
| `get_schedule` | The board for one ET day with per-tech load and gaps; "what does my day look like" |
| `find_availability` | Open two-hour arrival windows across days, preferring the tech who was last on site |
| `book_job` | Book into a returned window; re-checks the slot, stores access notes, emits `job.booked` |
| `reschedule_job` | Move a scheduled visit to a new window, keeping or changing the tech |
| `request_cancellation` | Mark a job pending cancellation and open an admin approval task; the agent cannot cancel outright |
| `add_note` | Note for the tech or office on a job or an address; codes stored, never read back |
| `create_task` | Callback, handoff, follow-up or review task in the Inbox |
| `web_search` | Tavily, for facts outside our records |
| `get_weather` | Open-Meteo current conditions and short forecast |
| `transferCall` (Vapi native) | Warm transfer to the office with a spoken summary; on no answer, the agent takes details and opens a handoff task |

## Design decisions and trade-offs

- **Vapi over Retell / ElevenLabs / DIY Twilio.** Free US number in minutes without KYC, native Claude models, per-tool filler speech, live transcript webhooks, a public-key web widget, warm transfer with no-answer detection. Trade-off: the LLM runs inside Vapi, so Opus 5 is not available for the live voice. Miami area codes were not in the free pool, hence 934.
- **Sonnet 5 for voice, Opus 5 offline.** The live turn has a latency budget; the heavy reasoning over six months of notes happens in batch (50% cheaper) and once per call after hang-up.
- **Deterministic fallback plus LLM dossiers.** `get_address_dossier` reads the Claude card when it exists and otherwise builds one in code from jobs, tags and invoice lines, so every address works even with an incomplete batch. Warranty conclusions are always rule-based with evidence, never LLM guesses.
- **Two-step cancellation.** A misheard "yes" must not delete a visit. The agent files a request, the job shows as pending everywhere, an admin approves or rejects with the transcript excerpt linked to the full call. Reschedules stay immediate because they are reversible.
- **Latency.** No LLM calls inside tool handlers, precomputed dossiers, trigram and date indexes, spoken fillers at 0 s and 3 s, `maxTokens` 250, a warm Postgres connection in a persistent container (one reason for Railway over serverless).
- **Identification by address.** The data has no phone numbers and company customers have dozens of sites, so the first question is the service address: normalized the same way on import and at query time, matched with `pg_trgm`, read back before anything is acted on. The number is saved after confirmation, so returning callers are greeted by name via the `assistant-request` webhook.

## Data notes

- **Warranty rules (derived, always stated with their basis):** labor covered 365 days after an HVAC install we did or a `1 Yr Labor Warranty` tag; parts "likely" covered 5 years unregistered, 10 with `Registration Complete`; `Warranty Claim` tags and `WARRANTY` invoice lines are evidence. Anything else is `unknown` and the office confirms. Install detection is HVAC-specific because a bare "install" also matches ~700 "Repairs & Part Installation" lines.
- **Note author type is a heuristic.** The export does not say who wrote a note; `scripts/import.ts` scores booking vocabulary against findings vocabulary, ties going to office for the first note and tech afterwards.
- **Address normalization:** lowercase, number words to digits, ordinals stripped, USPS directional and suffix abbreviations, unit designators unified; then trigram similarity with unit boosts.
- **Data quirks:** the data README promises a calendar through year end, but scheduled jobs stop on 2026-09-15; 20 "scheduled" jobs end weeks after they start (availability caps them to the start day); some jobs reference customers missing from `customers.jsonl` (stubs created); `jobs.outstanding_balance` and the invoices disagree, so balances come from jobs; the app re-redacts codes, phones and emails on read since a few slipped through.

## Running locally

```bash
cp .env.example .env          # fill in VAPI_*, ANTHROPIC_API_KEY, TAVILY_API_KEY, SESSION_SECRET
docker compose up -d          # Postgres 16 + pg_trgm on localhost:5433
pnpm install
pnpm db:migrate               # apply drizzle/ migrations
pnpm db:seed                  # business hours and service types
pnpm import                   # load front-desk-assignment/data/*.jsonl (idempotent)
pnpm db:seed-users            # office logins; passwords land in docs/CREDENTIALS.local.md (gitignored)
pnpm dossiers                 # Claude batch dossiers (resumable; needs API credit)
pnpm vapi:sync                # create/update the Vapi assistant and point the number at APP_URL
pnpm dev                      # http://localhost:3000
```

To take a real call on your laptop, tunnel port 3000 (`cloudflared`) and pass the URL as `--app-url` to `pnpm vapi:sync`. `pnpm test` runs the unit suite, several files of which hit the compose Postgres, so leave the container up or those suites fail; `pnpm analyze-calls` backfills end-of-call analysis. `OFFICE_HANDOFF_NUMBER` enables the live transfer tool; without it the agent takes details and opens a handoff task.

### Deploy (Railway)

Railway builds the `Dockerfile` (Next standalone) per `railway.json`. Set the same env vars on the `kebra-web` service plus Railway's `DATABASE_URL`, run `db:migrate`, `import` and `db:seed-users` against it, mirror dossiers with `pnpm dossiers -- --copy-to-env RAILWAY_DATABASE_URL`, then `pnpm vapi:sync --app-url https://<your-app>`.

Migrating production from a laptop goes through the Postgres service's public TCP proxy, not through `kebra-web`'s own `DATABASE_URL`:

```bash
railway run --no-local --service Postgres -- sh -c \
  'DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$RAILWAY_TCP_PROXY_DOMAIN:$RAILWAY_TCP_PROXY_PORT/$PGDATABASE" pnpm db:migrate'
```

Keep the single quotes — those variables must expand inside Railway's environment, not your shell. Append `?sslmode=require` to the URL if the proxy refuses a plaintext connection. Four things bite here:

- **`kebra-web`'s `DATABASE_URL` is unusable locally.** It points at `postgres.railway.internal`, which only resolves inside Railway's private network, while `railway run` executes on your machine. The lookup fails before any SQL runs and `drizzle-kit` exits 1 right after `Using 'postgres' driver for database querying` with no error printed, so the silence *is* the DNS failure. Hence the rebuilt URL above.
- **`-p/--project` takes a project ID, not a name.** `--project kebra-front-desk` fails with `Project not found. Run 'railway link'` even when the directory is already linked, and that hint sends you chasing a link that exists. Confirm with `railway status` and omit the flag when linked.
- **Pass `--no-local`.** This repo ships a `docker-compose.yml`, and `railway run` applies local develop overrides when one exists; the flag keeps a production migration from landing on `localhost:5433`.
- **Nothing migrates at deploy.** The image ends in `CMD ["node", "server.js"]`, so every schema change needs the command above by hand (see `docs/FOLLOWUPS.md`).

## Costs and receipts

| Item | Cost | Receipt |
|---|---|---|
| Claude Opus 5, dossier batches (4.06 M input / 0.96 M output tokens, 1,713 dossiers) | **$22.15** so far; ~$5.25 more to finish the remaining 410 rows | `receipts/claude-dossiers.md` (per-batch log) |
| Claude Opus 5, end-of-call analysis | cents per call, logged by `pnpm analyze-calls`; TODO final figure after QA | script output |
| Vapi | number free; calls billed at ~$0.05/min plus providers. As of 2026-09-02 16:55 UTC the Vapi API reports **0 calls, 0 minutes, $0.00** on this account (`GET /call`, `POST /analytics`) | TODO re-query after phone QA |
| Railway (Hobby plan: app + Postgres) | ~$5/month estimate | Railway invoice |
| Tavily | free tier | none |

Total to date about **$27**, expected to stay under $40 after QA calls and the remaining dossiers.

## Known gaps and follow-ups

- 291 addresses and 119 customers use the deterministic card until the dossier batch is finished (needs API credit).
- Access codes given to the agent sit in plain text in booking notes; the UI masks them, but a dedicated column with reveal logging would be better.
- `emitEvent` is not transaction-aware: an event write could fail after a booking commits.
- No after-hours flag in `business_hours`, so out-of-hours emergencies hand off instead of getting a slot.
- Live transfer needs `OFFICE_HANDOFF_NUMBER` on the Railway service; otherwise handoff is task-only.
- Free Vapi numbers are inbound-only and US-only; international graders should use `/call`.
- `railway.json` is deprecated for `.railway/railway.ts` (works until 2026-12-01).
- Not built: outbound confirmation SMS/email, per-tech map, owner revenue dashboard, editable business hours.

## Repo map

```
front-desk-assignment/   the brief and the data (jsonl + csv)
docs/                    PLAN.md (design), TOOLS.md (tool contract), EVENTS.md, QA.md, FOLLOWUPS.md, SUBMISSION.md, briefs/
receipts/                cost receipts (README.md indexes them)
scripts/                 import.ts, dossiers.ts, analyze-calls.ts, vapi-sync.ts
drizzle/                 SQL migrations
src/db/                  schema, client, seeds (business hours, users, fixtures)
src/agent/               registry.ts (the tool contract), tools/*, errors.ts
src/domain/              availability, jobs, change-requests, warranty, history, search, tasks, dossier fallback
src/voice/               assistant.ts (Vapi config), prompt.ts, webhook.ts, analyze-call.ts
src/lib/                 events, session/auth, time (ET), address normalization, anthropic client, cache
src/app/                 pages (today, calls, customers, addresses, jobs, inbox, call, login) and api routes
src/components/          atoms/ (incl. atoms/ui shadcn), molecules/, organisms/, templates/ — strict atomic design, see docs/UI-ARCHITECTURE.md
src/lib/ui/, src/hooks/    pure UI helpers and client hooks (no DB imports)
tests/                   registry and time tests (unit tests also live next to their modules)
```
