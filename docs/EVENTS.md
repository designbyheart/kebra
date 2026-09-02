# Event Catalog

Every mutation on the platform writes one row to `events`. The UI's live feed, the per-call "actions taken" list, and the audit trail are all views over this table. Emit with `emitEvent()` from `src/lib/events.ts` (`{ actor, actorId?, type, entityType, entityId?, payload, callId? }`); never insert directly. Column names below are the ones the W0 schema actually created.

## Row shape

| column | type | notes |
|---|---|---|
| `id` | bigserial | monotonic; SSE clients resume from the last id they saw |
| `ts` | timestamptz | server time |
| `actor` | enum `agent` \| `office` \| `system` | |
| `actor_id` | text nullable | `users.id` for `office`; `"vapi"` for `agent`; script name for `system` |
| `payload.actor_label` | text (inside payload) | "Agent", "Alina Farrell", "import" — denormalized for display; `emitEvent` callers must set it |
| `call_id` | text nullable | set whenever the action happened during a call |
| `type` | text | one of the types below |
| `entity_type` | text | `job` \| `note` \| `task` \| `call` \| `customer` \| `change_request` \| `user` |
| `entity_id` | text | |
| `payload` | jsonb | type-specific, see below; always includes `summary` (one human sentence) |

## Types

### Jobs
- `job.booked` — `{ summary, job_id, invoice_number, window_start, window_end, employee_id, employee_name, service_type, priority, customer_id, address_id, address_label }`
- `job.rescheduled` — `{ summary, job_id, old_window_start, new_window_start, old_employee_id?, new_employee_id?, reason }`
- `job.reassigned` — `{ summary, job_id, from_employee_id?, to_employee_id }` (office only)
- `job.status_changed` — `{ summary, job_id, from, to }` (office or system)
- `job.cancellation_requested` — `{ summary, job_id, change_request_id, reason }`
- `job.cancellation_approved` — `{ summary, job_id, change_request_id, approved_by }`
- `job.cancellation_rejected` — `{ summary, job_id, change_request_id, rejected_by, note }`

### Notes and tasks
- `note.added` — `{ summary, note_id, job_id, address_id?, preview (first 120 chars, redacted) }`
- `task.created` — `{ summary, task_id, kind, title, customer_id?, job_id?, due_at? }`
- `task.updated` — `{ summary, task_id, from_status, to_status, assigned_to? }`

### Calls (written by the voice webhook, W2-A)
- `call.started` — `{ summary, call_id, direction, caller_number_masked, via: "phone" | "web" }`
- `call.identified` — `{ summary, call_id, customer_id, address_id?, method: "phone" | "address" | "name" }`
- `call.transfer_attempted` — `{ summary, call_id, to_masked, reason }`
- `call.transfer_failed` — `{ summary, call_id, reason }`
- `call.ended` — `{ summary, call_id, duration_s, ended_reason, outcome? }`
- `call.analyzed` — `{ summary, call_id, outcome, promises_count, needs_review }` (W3-A)

### Customers and users
- `customer.phone_added` — `{ summary, customer_id, phone_masked, label }`
- `user.login` — `{ summary, user_id }`

### System
- `system.import` — `{ summary, counts: { jobs, notes, invoices, customers, employees } }`
- `system.dossiers_generated` — `{ summary, addresses, customers, cost_usd }`

## UI rendering rules

- The activity strip shows `payload.summary` prefixed by `actor_label` and a relative time; agent events get the agent badge; events with `call_id` link to the call.
- The Calls page derives "actions taken" from `events where call_id = ?` ordered by id.
- Phone numbers in payloads are stored masked (`+1 (305) •••-1234`); the full number lives only on `customer_phones` / `calls`.

## SSE

`GET /api/events/stream?since=<id>` (or header `Last-Event-ID`) streams the JSON row per event, starting from `max(id)` when no cursor is given, polling every 1.5 s with a heartbeat every 15 s. Clients keep the last id and reconnect with it. The board additionally refetches its day when it sees any `job.*` event for that date.
