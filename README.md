# Kebra Front Desk

AI front desk for an HVAC service business: a voice agent (Vapi) that books, reschedules and answers warranty/history questions against real job data, plus an office UI that watches it work live.

See `docs/PLAN.md` for architecture and the work breakdown.

## Local dev

```bash
cp .env.example .env         # fill in keys
docker compose up -d         # Postgres 16 + pgvector on :5433
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                     # http://localhost:3000
```

## Scripts

| script | what |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js (standalone output) |
| `pnpm lint` / `pnpm test` | eslint / vitest |
| `pnpm db:generate` | drizzle-kit: emit a migration from `src/db/schema.ts` into `drizzle/` |
| `pnpm db:migrate` | apply migrations to `DATABASE_URL` |
| `pnpm db:push` / `pnpm db:studio` | drizzle-kit push / studio |
| `pnpm db:seed` | seed `service_types` and `business_hours` (idempotent) |
| `pnpm import` | load the assignment JSONL (`scripts/import.ts`, W1-A) |

## Layout

- `src/db/` schema, client, seed; `drizzle/` migrations
- `src/agent/registry.ts` the one tool contract; served at `POST /api/agent/tools/<name>` (header `x-agent-secret`)
- `src/lib/` time (ET helpers), ids, events
- `src/app/api/health`, `src/app/api/events/stream` (SSE)
- `src/app/{today,calls,customers,jobs,inbox}` office UI

## Deploy

Dockerfile (multi-stage, Next standalone) + `railway.json`. Health check at `/api/health`.
