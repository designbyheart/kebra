import "dotenv/config";
import { db, sql } from "@/db";
import { customers } from "@/db/schema";


async function main() {
  const kinds = await db.selectDistinct({ kind: customers.kind }).from(customers).orderBy(customers.kind);
  console.log("kinds:", kinds.map((k) => k.kind));
  const maxes = await sql`
    select
      max(c.job_count) as max_jobs,
      max((select count(*) from addresses a where a.customer_id = c.id)) as max_sites,
      max((select coalesce(sum(j.outstanding_balance), 0) from jobs j where j.customer_id = c.id)) as max_balance
    from customers c
  `;
  console.log("maxes:", maxes[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
