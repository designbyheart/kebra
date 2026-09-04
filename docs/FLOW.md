# Flow map

How a call becomes a booking, and how the office sees it — without reading the code.
Companion docs: [`TOOLS.md`](TOOLS.md) (every tool's input/output), [`EVENTS.md`](EVENTS.md)
(every event payload), [`UI-ARCHITECTURE.md`](UI-ARCHITECTURE.md) (component layers),
[`PLAN.md`](PLAN.md) (why it is built this way).

## 1. The pieces

```mermaid
flowchart LR
  caller["Caller<br/>phone number or /call page"]
  vapi["Vapi<br/>speech, turn-taking, LLM loop<br/>model: claude-sonnet-5"]
  app["kebra-web<br/>Next.js on Railway"]
  pg[("Postgres<br/>jobs, calls, events, tasks, ...")]
  office["Office browser<br/>today / calls / jobs / inbox"]
  claude["Anthropic<br/>dossiers, end-of-call analysis"]
  tavily["Tavily<br/>web_search"]
  meteo["Open-Meteo<br/>get_weather"]

  caller <--> vapi
  vapi -- "POST /api/voice/webhook" --> app
  office <--> app
  app <--> pg
  app --> claude
  app --> tavily
  app --> meteo
```

Vapi owns the voice loop and the model. The app owns every fact: it never lets the model
invent scheduling, warranty or history — those come back as tool results with a
`speech_hint` the model can read aloud verbatim.

## 2. One inbound call, end to end

```mermaid
sequenceDiagram
  participant C as Caller
  participant V as Vapi
  participant W as /api/voice/webhook
  participant R as Tool registry
  participant DB as Postgres
  participant O as Office screen

  C->>V: dials the number
  V->>W: assistant-request
  W->>DB: lookupCaller by phone
  W-->>V: assistantId + variableValues<br/>caller_name, known_sites, now_et
  Note over V: known caller is greeted by name<br/>and skips identification

  V->>W: status-update "in-progress"
  W->>DB: insert calls row + event call.started
  W-->>O: live row appears

  C->>V: "my upstairs unit is frozen, 3284 Harborlight Hollow"
  V->>W: tool-calls find_address
  W->>R: dispatch in-process
  R->>DB: trigram match on addresses.search_text
  R-->>V: {ok, result, speech_hint}
  W->>DB: event call.identified
  V->>C: reads the address back

  V->>W: tool-calls get_address_dossier, find_availability
  R-->>V: last visit, warranty, two real windows
  C->>V: picks a window
  V->>W: tool-calls book_job
  R->>DB: insert job + assignment, event job.booked
  R-->>V: window_label + tech name
  V->>C: reads back window, tech, asks about access

  C->>V: hangs up
  V->>W: end-of-call-report
  W->>DB: transcript, duration, cost, event call.ended
  W->>W: analyzeCall in background
  W->>DB: summary, outcome, promises, needs_review<br/>event call.analyzed
```

Transcript turns stream in on `transcript` messages, so the call page fills in while the
caller is still talking. `hang` and `transfer-update` cover the silent-call and
live-transfer paths.

## 3. The tool contract

Every tool is reachable two ways, and both land on the same registry entry — so anything
the agent can do, the office UI and a curl command can do too.

```mermaid
flowchart TB
  subgraph entrances
    v["Vapi tool-calls message<br/>/api/voice/webhook"]
    h["POST /api/agent/tools/&lt;name&gt;<br/>header x-agent-secret"]
    u["Office UI server action<br/>actor: office, actorId: users.id"]
  end
  v --> reg
  h --> auth{"secret matches<br/>VAPI_WEBHOOK_SECRET?"}
  auth -- no --> unauth["401"]
  auth -- yes --> reg
  u --> dom

  reg["registry lookup by tool name<br/>src/agent/registry.ts"] --> zod{"zod parse<br/>of tool input"}
  zod -- invalid --> err
  zod -- valid --> dom["domain function<br/>scheduling, jobs, warranty, search"]
  dom --> ok["ok: true — result + speech_hint"]
  dom -. "throws ToolError" .-> err["ok: false — error + speech_hint"]
  dom --> ev["emitEvent → events table"]

  style unauth stroke-dasharray: 4
```

Rules that make the voice side safe: descriptions in the registry **are** the model's
prompt (`scripts/vapi-sync.ts` generates Vapi's tool definitions from them), every
response carries a one-sentence `speech_hint`, expected failures throw `ToolError` rather
than a bare `Error`, write tools take an `idempotency_key` so a repeated tool call returns
the original result, and no tool makes an LLM call inside the request — dossiers are
precomputed to keep p95 under the latency budget.

## 4. What a booking does to the data

```mermaid
flowchart LR
  bj["book_job"] --> lock["advisory lock on the tech"]
  lock --> slot{"slot still legal?<br/>hours, duration, no overlap"}
  slot -- no --> te["ToolError outside_hours / conflict"]
  slot -- yes --> seq["nextval invoice_number_seq"]
  seq --> ins["insert job + job_assignments"]
  ins --> bnote["booking note with access info"]
  bnote --> evt["event job.booked"]
```

The advisory lock plus the re-check inside the transaction is what stops two callers
booking the same tech in the same window. The invoice number comes from a Postgres
sequence, not `max()+1`, for the same reason.

## 5. Job status, and why cancellations are a request

The agent never cancels. It records a request; a human decides.

```mermaid
stateDiagram-v2
  [*] --> scheduled: book_job
  scheduled --> scheduled: reschedule_job, new window or tech
  scheduled --> pending_cancellation: request_cancellation
  pending_cancellation --> user_canceled: office approves
  pending_cancellation --> scheduled: office rejects, previous status restored
  scheduled --> in_progress: office
  in_progress --> complete: office
  complete --> [*]
```

```mermaid
sequenceDiagram
  participant C as Caller
  participant A as Agent
  participant DB as Postgres
  participant OF as Office owner or admin

  C->>A: "cancel my Thursday appointment"
  A->>DB: request_cancellation
  Note over DB: change_requests row (pending)<br/>job → pending_cancellation<br/>task in the inbox<br/>event job.cancellation_requested
  A->>C: "the office will confirm" — never "it's canceled"
  OF->>DB: approve
  Note over DB: job → user canceled, canceled_at set<br/>task closed, event job.cancellation_approved
  OF->>DB: or reject with a note
  Note over DB: job → previous_status<br/>callback task created<br/>event job.cancellation_rejected
```

Approve and reject are owner/admin only. Rejection restores the exact status the job had
before, which is why `change_requests.previous_status` exists.

## 6. How the office screen stays live

```mermaid
sequenceDiagram
  participant T as Any write (agent or office)
  participant DB as Postgres
  participant S as /api/events/stream
  participant B as Board / activity strip

  T->>DB: domain write + emitEvent
  B->>S: GET ?since=<last id>
  loop every 1.5 s
    S->>DB: events with id > cursor
  end
  S-->>B: one JSON row per event
  B->>B: append to the activity strip
  B->>DB: refetch the day when a job.* event<br/>touches the visible date
  Note over S,B: heartbeat every 15 s;<br/>client reconnects with its last id
```

`events` is the single source for the live feed, a call's "actions taken" list, and the
audit trail — every mutation writes exactly one row through `emitEvent()`.

## 7. Who is allowed in

```mermaid
flowchart TB
  req["request"] --> pub{"public path?<br>/login, /call, /api/health<br>/api/voice/*, /api/agent/*, /api/auth/*"}
  pub -- yes --> pass["through"]
  pub -- no --> cookie{"valid session cookie?"}
  cookie -- no, page --> login["307 → /login?next=..."]
  cookie -- no, /api --> j401["401 JSON"]
  cookie -- yes --> pass
  pass --> route["route handler"]
  route --> sec{"agent or voice route?"}
  sec -- yes --> shared["own shared secret<br/>x-agent-secret / x-vapi-secret<br/>timing-safe compare"]
```

The webhook and tool routes are public to the *proxy* on purpose: they authenticate with a
shared secret inside the handler, never with a cookie.

## 8. Core tables

```mermaid
erDiagram
  customers ||--o{ addresses : "has sites"
  customers ||--o{ customer_phones : "known numbers"
  customers ||--o{ jobs : ""
  addresses ||--o{ jobs : "service address"
  addresses ||--|| address_dossiers : "precomputed brief"
  jobs ||--o{ job_assignments : "techs"
  jobs ||--o{ notes : "office + tech notes"
  jobs ||--o{ invoices : ""
  jobs ||--o{ change_requests : "cancellations"
  jobs ||--o{ tasks : "inbox work"
  employees ||--o{ job_assignments : ""
  calls ||--o{ events : "call_id"
  users ||--o{ events : "actor_id"
```

`service_types` and `business_hours` drive every availability search; `idempotency_keys`
de-duplicates repeated tool calls; `events` is written by everything.

## 9. Getting it to production

Two separate acts, neither implied by the other — see the README's *Deploy (Railway)*
section for the exact commands and the traps.

```mermaid
flowchart LR
  code["working directory"] -- "railway deployment up" --> build["Docker build on Railway"]
  build --> health{"/api/health passes?"}
  health -- yes --> live["new container serves traffic"]
  health -- no --> keep["old container stays"]
  mig["drizzle/*.sql"] -- "pnpm db:migrate via the Postgres TCP proxy" --> dbp[("production Postgres")]
  gh["git push"] -. "ships nothing" .-> build
```
