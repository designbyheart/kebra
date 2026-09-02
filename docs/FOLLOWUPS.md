# Follow-ups (post-MVP)

- Booking notes store caller-provided access codes in plain text (W1-B). UI must mask them (W2-D does); consider a separate `access_codes` column with reveal logging.
- `emitEvent` is not transaction-aware: an event write can fail after a booking commits (W1-B). Move to same-transaction emit when domain functions accept a tx handle.
- `business_hours` has no after-hours flag, so emergency/high priority never offers outside hours; agent hands off instead (acceptable for demo).
- 20 imported "scheduled" jobs end weeks after their start; availability caps their blocking span to the start day.
- Next 16 deprecates `middleware.ts` in favour of `proxy`; rename when convenient.
- Railway: delete the public Postgres TCP proxy before submission; `railway.json` deprecated for `.railway/railway.ts` (works until 2026-12-01).
