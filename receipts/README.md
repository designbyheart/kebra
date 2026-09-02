# Receipts

Everything that cost money while building the Gulf Breeze Air front desk, for reimbursement per the brief. Figures are also summarized in the root README under "Costs and receipts".

| File | Vendor | What | Amount | Status |
|---|---|---|---|---|
| `claude-dossiers.md` | Anthropic | Opus 5 Message Batches for 1,713 address/customer dossiers; per-batch token and cost log appended by `pnpm dossiers` | $22.15 | partial: 410 rows (~$5.25) pending credit top-up |
| (script output) | Anthropic | Opus 5 end-of-call analysis, one request per ended call; `pnpm analyze-calls` prints tokens and cents per call and a total | TBD after QA | pending |
| (Vapi dashboard) | Vapi | Free US number +1 (934) 647-8409; call minutes billed at ~$0.05/min plus STT/LLM/TTS at cost. API totals on 2026-09-02 16:55 UTC: 0 calls, 0 min, $0.00 | $0.00 so far | re-query after phone QA: `GET https://api.vapi.ai/call?limit=100` or `POST /analytics` |
| (Railway invoice) | Railway | Hobby plan, `kebra-web` service + Postgres | ~$5/month estimate | invoice at month end |
| none | Tavily | web_search, free tier | $0 | n/a |
| none | Open-Meteo | get_weather, no key | $0 | n/a |

Add a file per vendor statement (PDF or markdown) here as they arrive and update the table.
