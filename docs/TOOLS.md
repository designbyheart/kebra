# Agent Tool Contract

The single API surface the voice agent uses. The office UI calls the same domain functions underneath; nothing the agent can do is agent-only. Frozen for Wave 1; changes go through the coordinator and are recorded in the changelog at the bottom.

## Conventions

- **Transport:** `POST /api/agent/tools/<name>` with JSON body = the tool's `input`. Header `x-agent-secret: $VAPI_WEBHOOK_SECRET`. Vapi's tool-call webhook (`/api/voice/webhook`, message type `tool-calls`) dispatches to the same registry in-process, so every tool is callable both ways.
- **Registry:** `src/agent/registry.ts` exports `tools: Record<string, ToolDef>` where `ToolDef = { description, input: ZodSchema, handler(input, ctx) }`. `ctx: ToolContext = { callId: string | null, actor: "agent" | "office", actorId?: string | null }` (office calls pass the `users.id` as `actorId`). The Vapi assistant's tool definitions are generated from this registry (`scripts/vapi-sync.ts`, Wave 2), so **descriptions are prompts**: write them for the model.
- **Response envelope:** `{ ok: true, result: T, speech_hint: string }` or `{ ok: false, error: { code, message, details? }, speech_hint: string }`. `speech_hint` is one short sentence the model may read verbatim. Always present, even on errors ("I couldn't find that address, could you spell the street name?").
- **Handler convention:** a handler returns the `result` object with a `speech_hint` field inside it; the dispatcher hoists `speech_hint` to the envelope. For coded failures a handler throws `new ToolError(code, message, speech_hint, details?)` from `src/agent/errors.ts`; the dispatcher maps it to the envelope and a 4xx/5xx status. Never throw plain `Error` for expected conditions.
- **Time:** inputs and outputs use ISO-8601 with offset. Anything spoken is pre-formatted in ET inside `speech_hint` and in `*_label` fields (e.g. `window_label: "Tuesday September 2, 10 AM to noon"`).
- **Money:** integer cents in `result`, formatted dollars in labels.
- **Latency budget:** p95 < 800 ms server-side. No LLM calls inside tool handlers (dossiers are precomputed).
- **Idempotency:** write tools accept an optional `idempotency_key` (the Vapi tool-call id). Repeats return the original result.
- **Events:** every write tool emits exactly one event (see `EVENTS.md`) and, when `ctx.callId` is set, appends to `calls.tool_calls`.
- **Never return** door/gate codes in `speech_hint`. They may appear in `result.access_notes` for the UI, flagged `sensitive: true`.

## Identity and lookup

### `find_address`
Fuzzy match a spoken service address.
- input: `{ query: string, unit?: string, city?: string, customer_id?: string }`
- result: `{ candidates: [{ address_id, customer_id, customer_name, street, unit, city, zip, label, confidence 0..1, last_visit_at? }] }` (max 5, sorted by confidence). If `confidence >= 0.85` for the top one and it is unambiguous, `speech_hint` reads it back for confirmation. If the street matches a multi-unit building and no `unit` was given, `speech_hint` asks for the unit.
- impl: `pg_trgm` similarity on `addresses.search_text` after normalizing number words, "St/Street", "E/East", ordinal suffixes; boost when `customer_id` matches; boost recently visited.

### `find_customer`
- input: `{ name?: string, company?: string, phone?: string }` (at least one)
- result: `{ candidates: [{ customer_id, display_name, kind, company, sites_count, last_job_at, label }] }`
- Phone matches `customer_phones` exactly (E.164). Names use trigram on `display_name` and `company`.

### `save_caller_phone`
- input: `{ customer_id, phone (E.164), label?: "mobile" | "office" | "other" }`
- result: `{ saved: true }` — upsert into `customer_phones` with `source: "agent"`. Event `customer.phone_added`.

## Knowledge

### `get_address_dossier`
The one-call answer to "when were you last here and what did you do".
- input: `{ address_id }`
- result: `{ address_label, customer: {customer_id, display_name, kind}, last_visit: { job_id, invoice_number, date, tech_names[], summary, description, status } | null, visit_count_12m, equipment: [{ kind, brand?, model?, tonnage?, installed_at?, source_job_id }], open_issues: string[], recurring_issues: string[], warranty: <same shape as check_warranty.result>, open_balance_cents, upcoming: [{ job_id, window_start, window_label, tech_names[], description }], access_notes: { text, sensitive: true } | null, summary_md }`
- `speech_hint` is a two-sentence spoken version: last visit + what was done + one flag if any (open issue / balance / warranty).
- impl: reads `address_dossiers` (precomputed by W1-D); if missing, falls back to a deterministic build from jobs/notes (W1-C provides `buildDossierFallback`).

### `get_visit_history`
- input: `{ address_id?: string, customer_id?: string, limit?: number (default 5), before?: ISO }`
- result: `{ visits: [{ job_id, invoice_number, date, status, description, tech_names[], one_line, total_cents, outstanding_cents, tags[] }] }`
- `one_line` is the first tech note's first sentence or the deterministic summary; never the raw multi-paragraph note.

### `get_job_notes`
Raw notes for follow-ups ("what exactly did the tech write?").
- input: `{ job_id }`
- result: `{ job_id, invoice_number, notes: [{ seq, author_type, content_redacted }] }` (codes/phones redacted to `[code]`/`[phone]`, which the data already does).

### `get_job`
- input: `{ job_id?: string, invoice_number?: string }` (one required)
- result: `{ job_id, invoice_number, description, work_status, priority, window_start, window_end, window_label, arrival_window_min, tech: [{employee_id, name}], customer, address_label, total_cents, outstanding_cents, tags[], notes_count, last_note_one_line, source }`

### `check_warranty`
- input: `{ address_id, equipment_hint?: string }`
- result: `{ status: "covered" | "partially_covered" | "expired" | "unknown", labor: { covered: boolean, until?: ISO, basis: string }, parts: { covered: boolean | "likely", until?: ISO, registered: boolean | "unknown", basis: string }, install_job_id?, evidence: [{ kind: "tag" | "install_job" | "invoice_item" | "note", job_id, text }], caveat: string, needs_office_confirmation: boolean }`
- rules (W1-C): labor covered if an install-family job completed at this address within 365 days OR tag `1 Yr Labor Warranty` on a job ≤ 365 days old; parts `likely` covered if install ≤ 5 years (unregistered) or ≤ 10 years with `Registration Complete`; `Warranty Claim` / `WARRANTY Parts` invoice items are evidence of manufacturer coverage; anything else → `unknown` + `needs_office_confirmation: true`. `speech_hint` states the answer and its basis in one sentence and never over-promises.

### `get_open_balance`
- input: `{ customer_id }`
- result: `{ total_cents, invoices: [{ invoice_number, job_id, due_cents, service_date, status }] }`

## Schedule

### `get_schedule`
The board for a day ("what does my day look like", "is Tanya free at two").
- input: `{ date: "YYYY-MM-DD" (ET), employee_id?: string }`
- result: `{ date, summary: { total, by_status: {...}, techs_working: n, first_start, last_end, unassigned: n, needs_scheduling: n, in_progress: n, pending_cancellation: n }, jobs: [{ job_id, invoice_number, window_start, window_end, window_label, status, priority, description, customer_name, address_label, tech_names[], source }], techs: [{ employee_id, name, job_count, first_start, last_end, gaps: [{start,end}] }] }`
- `speech_hint`: one sentence for the owner ("Ten jobs today across six techs, two callbacks, one still unassigned.").

### `find_availability`
- input: `{ from: ISO | "YYYY-MM-DD", to?: ISO | "YYYY-MM-DD" (default from + 3 days), service_type: "diagnostic" | "repair" | "maintenance" | "install" | "callback" | "estimate", priority?: "normal" | "high" | "emergency", preferred_employee_id?: string, address_id?: string, limit?: number (default 4) }`
- result: `{ slots: [{ window_start, window_end, window_label, employee_id, employee_name, reason: "last_tech_here" | "least_loaded" | "only_available" }] }`
- rules (W1-B): business hours from `business_hours`; arrival windows are 2 h and start on the hour; a tech is free for a window if no non-canceled job of theirs overlaps `[window_start, window_start + service duration)`; emergency/high may offer today outside hours only if `business_hours` marks after-hours allowed (default no; the agent then hands off). Prefer the tech who last visited `address_id`, then least loaded that day. Never return a slot in the past.

### `book_job`
- input: `{ customer_id, address_id, service_type, window_start: ISO, employee_id, issue_summary: string, priority?: "normal" | "high" | "emergency", caller_name?: string, caller_phone?: string, access_notes?: string, idempotency_key?: string }`
- result: `{ job_id, invoice_number, window_start, window_end, window_label, employee_name, confirmation_line }`
- behavior: re-validates the slot (409 `slot_taken` with `speech_hint` offering to search again); creates `jobs` (status `scheduled`, `source: agent`, description from service type label, arrival_window 120, next `invoice_number` = max + 1); `job_assignments`; a booking note (`author_type: agent`) containing issue, caller, and access notes; saves `caller_phone` if given; emits `job.booked`.

### `reschedule_job`
- input: `{ job_id, new_window_start: ISO, employee_id?: string (default current), reason: string, idempotency_key?: string }`
- result: `{ job_id, old_window_label, new_window_label, employee_name }`
- behavior: only for statuses `scheduled` / `needs scheduling`; validates availability like `book_job`; appends a note; emits `job.rescheduled`.

### `request_cancellation`
- input: `{ job_id, reason: string, idempotency_key?: string }`
- result: `{ change_request_id, job_id, status: "pending", speech_hint }`
- behavior: sets `jobs.work_status = pending_cancellation` (remembering the previous status in `change_requests.previous_status`), inserts `change_requests` with `call_id` and `transcript_ref` = current transcript length (so the UI can highlight from there), creates an Inbox task `kind: cancellation` for admins, emits `job.cancellation_requested`. There is no `cancel_job` tool for the agent; admins approve or reject in the platform (W2-E).

### `add_note`
- input: `{ job_id?: string, address_id?: string, content: string, idempotency_key?: string }` (one target required)
- result: `{ note_id }`
- behavior: `author_type: agent`; if only `address_id`, attaches to the most recent job at that address and tags the note `[address note]`; emits `note.added`.

### `create_task`
- input: `{ kind: "callback" | "followup" | "review" | "handoff", title: string, body?: string, customer_id?: string, job_id?: string, due_at?: ISO, idempotency_key?: string }`
- result: `{ task_id }` — emits `task.created`.

## Outside the data

### `web_search`
- input: `{ query: string, max_results?: number (default 3) }`
- result: `{ results: [{ title, url, snippet }] , answer?: string }` (Tavily, `include_answer: "basic"`, 4 s timeout, 10-minute in-memory cache by query)
- `speech_hint`: the `answer` if present, else the first snippet trimmed to one sentence.

### `get_weather`
- input: `{ location?: string (city or address label; default "Miami, FL"), lat?: number, lng?: number, when?: "now" | "today" | "tomorrow" | ISO }`
- result: `{ location_label, current: { temp_f, feels_like_f, humidity, conditions }, forecast: [{ time_label, temp_f, precip_prob, conditions }] }` (Open-Meteo, no key; geocode via Open-Meteo geocoding; 15-minute cache)

## Control

### `transfer_to_office`
Not implemented as an HTTP tool. Configured in the Vapi assistant as a native `transferCall` to `OFFICE_HANDOFF_NUMBER` (warm transfer with no-answer detection). The webhook records `call.transfer_attempted` / `call.transfer_failed`; on failure the assistant is instructed to call `create_task({kind:"handoff"})` and promise a callback. The reasons that must trigger it are listed in PLAN.md §7.

### `ping`
- input: `{}` → `{ time_et }`. Health check for the dispatcher.

## Error codes

`not_found`, `ambiguous` (result carries `candidates`), `slot_taken`, `outside_hours`, `invalid_state` (e.g. rescheduling a completed job), `validation` (zod issues in `error.details`), `upstream` (web tools), `unauthorized`.

## Changelog

- 2026-09-02 v1 — frozen for Wave 1.
- 2026-09-02 v1.1 — aligned `ctx` shape and handler convention with the W0 scaffold (`src/agent/registry.ts`, `src/agent/errors.ts`).
- 2026-09-02 v1.2 (W1-E) — `web_search.speech_hint` speaks only the first sentence of Tavily's answer (full answer in `result.answer`); `get_weather` retries geocoding without the Florida bias when the biased query finds nothing and returns `not_found` otherwise; `max_results` is optional with the default applied in the handler so the JSON schema marks it optional.
- 2026-09-02 v1.3 (W1-A) — address similarity = 0.5·similarity + 0.5·word_similarity; unit boosts (+0.20 exact, +0.10 partial, −0.10 different unit in same building); extra fields `find_address.{needs_unit, units}` and `find_customer.{confidence, matched_by}`; both throw `not_found` on zero candidates.
