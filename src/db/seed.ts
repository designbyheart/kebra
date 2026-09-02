import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, sql as pg } from "./index";
import { businessHours, serviceTypes } from "./schema";

const SERVICE_TYPES = [
  { id: "diagnostic", name: "Diagnostic", durationMinutes: 60, description: "No-cool / no-heat troubleshooting visit" },
  { id: "repair", name: "Repair", durationMinutes: 120, description: "Repair after diagnosis or known fault" },
  { id: "maintenance", name: "Maintenance", durationMinutes: 90, description: "Tune-up / seasonal maintenance" },
  { id: "install", name: "Installation", durationMinutes: 480, description: "System installation (full day)" },
  { id: "callback", name: "Callback", durationMinutes: 60, description: "Return visit on a recent job" },
  { id: "estimate", name: "Estimate", durationMinutes: 60, description: "Sales / replacement estimate" },
];

const HOURS = [
  { dow: 0, open: null, close: null, closed: true },
  { dow: 1, open: "08:00", close: "18:00", closed: false },
  { dow: 2, open: "08:00", close: "18:00", closed: false },
  { dow: 3, open: "08:00", close: "18:00", closed: false },
  { dow: 4, open: "08:00", close: "18:00", closed: false },
  { dow: 5, open: "08:00", close: "18:00", closed: false },
  { dow: 6, open: "08:00", close: "14:00", closed: false },
].map((h) => ({ ...h, tz: "America/New_York" }));

async function main() {
  await db
    .insert(serviceTypes)
    .values(SERVICE_TYPES)
    .onConflictDoUpdate({
      target: serviceTypes.id,
      set: {
        name: sql`excluded.name`,
        durationMinutes: sql`excluded.duration_minutes`,
        description: sql`excluded.description`,
      },
    });
  await db
    .insert(businessHours)
    .values(HOURS)
    .onConflictDoUpdate({
      target: businessHours.dow,
      set: {
        open: sql`excluded.open`,
        close: sql`excluded.close`,
        closed: sql`excluded.closed`,
        tz: sql`excluded.tz`,
      },
    });
  console.log(`seeded ${SERVICE_TYPES.length} service_types, ${HOURS.length} business_hours rows`);
}

main()
  .then(() => pg.end())
  .catch(async (e) => {
    console.error(e);
    await pg.end();
    process.exit(1);
  });
