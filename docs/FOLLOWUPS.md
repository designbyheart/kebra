# Follow-ups (post-MVP)

- Booking notes store caller-provided access codes in plain text (W1-B). UI must mask them (W2-D does); consider a separate `access_codes` column with reveal logging.
- `emitEvent` is not transaction-aware: an event write can fail after a booking commits (W1-B). Move to same-transaction emit when domain functions accept a tx handle.
- `business_hours` has no after-hours flag, so emergency/high priority never offers outside hours; agent hands off instead (acceptable for demo).
- 20 imported "scheduled" jobs end weeks after their start; availability caps their blocking span to the start day.
- Migrations are manual: the image ends in `CMD ["node", "server.js"]`, so each schema change needs `pnpm db:migrate` driven from a laptop through the Postgres TCP proxy (README, *Deploy (Railway)*). Move it into the start command so a deploy migrates from inside the private network, where `postgres.railway.internal` actually resolves.
- Railway: delete the public Postgres TCP proxy before submission (the manual-migration recipe above depends on it, so retire both together); `railway.json` deprecated for `.railway/railway.ts` (works until 2026-12-01).
