# Claude dossier receipts (W1-D)

`pnpm dossiers` precomputes one memory card per service address and per customer with
`claude-opus-5` through the Message Batches API (structured JSON output, adaptive thinking,
effort `medium`, `max_tokens` 3000). Batch pricing is 50% of list: **input $2.50/M, output
$12.50/M** (list $5 / $25). Cost = round((input × 2.5 + output × 12.5) / 1e6 × 100) cents,
summed per batch; thinking tokens are included in output tokens.

## Status as of 2026-09-02 17:05 UTC

| | generated | target | remaining |
|---|---|---|---|
| `address_dossiers` | 1,100 | 1,391 addresses with ≥1 job | 291 |
| `customer_dossiers` | 613 | 732 customers with ≥1 job | 119 |

- Requests submitted: 2,123 (4 batches). Succeeded 1,713. Errored 410 — every one of them
  `invalid_request_error: Your credit balance is too low to access the Anthropic API`, i.e.
  the org's prepaid credit ran out while the two full batches were processing. Errored
  requests are not billed. Refusals (`stop_reason: "refusal"`): 0. Truncated at
  `max_tokens`: 0. Malformed / off-schema JSON: 0.
- Tokens billed: **4,060,310 input, 959,531 output** (of which 158,810 thinking).
- **Total cost: $22.15.** Finishing the remaining 410 rows at the observed per-row cost
  ($0.0122 per address, $0.0142 per customer) needs about $5.25 more credit.
- To finish: add credit, then run `pnpm dossiers` — it skips fresh rows and resubmits only
  the pending ones. `pnpm dossiers -- --status <batch_id>` inspects a batch;
  `pnpm dossiers -- --copy-to-env RAILWAY_DATABASE_URL` mirrors finished rows to Railway
  (done for the 1,713 rows above).

## Notes on the API surface

- `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) is **not accepted by the
  Batches API** — verified: `The fallbacks parameter is not supported for batch requests`
  (400 at batch creation). Requests therefore go through the plain `client.messages.batches`
  surface and every result is checked for `stop_reason === "refusal"`, which is recorded as
  an error and retried on the next run.
- `custom_id` must match `^[a-zA-Z0-9_-]{1,64}$`; ids are `addr-<address_id>` and
  `cust-<customer_id>`. Results are keyed by `custom_id`, never by position.
- Input per request is capped at 60K estimated tokens, dropping the oldest notes first.
  The estimator was recalibrated after the first 40 results (2.2 chars/token + 500 overhead;
  the naive 3.5 chars/token undercounted by ~2x). Largest customer request ≈ 60K tokens.
- Summary length: the prompt asks for 45–75 words with a 90-word hard limit; in the first
  full run (asked for 50–85) about 8% of summaries ran 91–104 words.

## Per-batch log (appended automatically by the script)

| ended (UTC) | batch id | kind | requests | ok | failed | refusals | input tok | output tok (thinking) | cost |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-02T16:08:47.363Z | msgbatch_01PmfpJKmA3ADYuYH4Umm4AN | address | 20 | 20 | 0 | 0 | 39,975 | 9,540 (897) | $0.22 |
| 2026-09-02T16:14:49.415Z | msgbatch_01VpZctZ5MVMxPUz6FaA79De | customer | 20 | 20 | 0 | 0 | 55,382 | 12,067 (776) | $0.29 |
| 2026-09-02T16:50:32.000Z | msgbatch_0142J2AJ8tu8rGs6rNpRsG2P | address | 1371 | 1080 | 291 | 0 | 2,273,724 | 602,607 (117,153) | $13.22 |
| 2026-09-02T16:58:00.000Z | msgbatch_017tBk91JFCWcSzKvynnrcC7 | customer | 712 | 593 | 119 | 0 | 1,691,229 | 335,317 (39,984) | $8.42 |
