# W3-A — End-of-call intelligence

## Ground rules
Same as Wave 2 (see any W2 brief): read PLAN.md §1 and §2, EVENTS.md; do not commit; stay in owned files; never print secrets; minimal what/why/how report.

## You own
`src/voice/analyze-call.ts`, `src/app/api/voice/analyze/route.ts` (internal trigger, secret-protected), `scripts/analyze-calls.ts` (backfill), tests. Reads `calls`, `events`; writes `calls.summary`, `calls.outcome`, `calls.promises`, `calls.needs_review`, and emits `call.analyzed`.

## Deliverables
1. `analyzeCall(callId)`: one Claude request (`@anthropic-ai/sdk`, model `claude-opus-5`, `output_config.format` JSON schema, no prefill, no budget_tokens) with the transcript, the tool calls and the events for the call. Output: `summary` (≤60 words, past tense, names the customer/address if identified), `outcome` enum (booked | rescheduled | cancellation_requested | info_only | handoff | voicemail | abandoned | other), `promises[]` (each: `text` as spoken, `kind` callback | timing | price | warranty | other, `due_by` ISO if inferable, `backed_by_action` boolean = an event exists that fulfils it), `needs_review` boolean with `review_reason` (any promise not backed by an action, any warranty or price statement, any transfer failure, any tool error the caller heard, caller frustration), `caller_sentiment` (calm | frustrated | urgent).
2. Trigger: W2-A's webhook calls `analyzeCall` after `end-of-call-report` (fire-and-forget with error logging); expose `POST /api/voice/analyze { callId }` with `x-agent-secret` for retries, and `pnpm analyze-calls` to backfill any ended call without `summary`.
3. Promises that are not backed by an action become an Inbox task of kind `review` ("Agent promised X to <customer> on call <id>") unless one already exists for that call.
4. Cost: log tokens per call; expected < $0.05 per call.

## Acceptance
- Fixture transcripts (3: a clean booking, a warranty question with a vague promise, a failed transfer) produce the expected outcome/needs_review; the vague promise creates a review task.
- Running the backfill twice creates no duplicate tasks or events.
