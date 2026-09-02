import "dotenv/config";
import { searchCustomers } from "@/app/customers/queries";

async function main() {
  console.log("\n1. Recent customers sorted by balance desc:");
  const recent = await searchCustomers("", {}, { column: "balance", direction: "desc" });
  console.log("count:", recent.customers.length);
  console.log("top:", recent.customers.slice(0, 3).map((c) => `${c.display_name} $${c.open_balance_cents / 100}`));

  console.log("\n2. Homeowner filter:");
  const homeowners = await searchCustomers("", { kinds: ["homeowner"] });
  console.log("count:", homeowners.customers.length);
  console.log("kinds:", [...new Set(homeowners.customers.map((c) => c.kind))]);

  console.log("\n3. Balance range $1,000-$5,000:");
  const balanced = await searchCustomers("", { balanceMin: 1000 * 100, balanceMax: 5000 * 100 });
  console.log("count:", balanced.customers.length);
  console.log("range:", balanced.customers.slice(0, 3).map((c) => `${c.display_name} $${c.open_balance_cents / 100}`));

  console.log("\n4. Jobs range 5-10:");
  const jobs = await searchCustomers("", { jobsMin: 5, jobsMax: 10 });
  console.log("count:", jobs.customers.length);
  console.log("range:", jobs.customers.slice(0, 3).map((c) => `${c.display_name} jobs=${c.job_count}`));

  console.log("\n5. Search 'Lighthouse' sorted by name asc:");
  const search = await searchCustomers("Lighthouse", {}, { column: "name", direction: "asc" });
  console.log("count:", search.customers.length);
  console.log("names:", search.customers.map((c) => c.display_name));

  console.log("\n6. Search 'Lighthouse' default match order:");
  const searchDefault = await searchCustomers("Lighthouse");
  console.log("names:", searchDefault.customers.map((c) => `${c.display_name} (${Math.round((c.confidence ?? 0) * 100)}%)`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
