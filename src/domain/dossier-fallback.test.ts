import "dotenv/config";
import { describe, expect, it } from "vitest";
import { sql } from "@/db";
import { buildDossierFallback, isWorkFamily, itemFamily } from "./dossier-fallback";

const NOW = new Date("2026-09-02T16:00:00Z");
const HARBORLIGHT = "adr_04dde9629abe496f99b95a5a9e94a3f0";
const GROUPER = "adr_4840691e98d443c2b4edcae6e86ced8a";
const SEAGRAPE = "adr_2d7a0e636f9c4c57ae7ba869142f0355";
const TIDEWATER = "adr_3ced064501d8450ea46a723cb476540e";

describe("itemFamily", () => {
  it("keeps the price-book leaf and drops fee / material noise", () => {
    expect(itemFamily("Service Calls - Repairs & Part Installation - **Tier 3 Repair - Clear Drain Line")).toBe("Clear Drain Line");
    expect(itemFamily("Tier 3 Repair - Capacitor Replacement")).toBe("Capacitor Replacement");
    expect(isWorkFamily("Clear Drain Line")).toBe(true);
    expect(isWorkFamily("Standard")).toBe(false);
    expect(isWorkFamily("Residential Preventative Maintenance")).toBe(false);
    expect(isWorkFamily("Visit #4")).toBe(false);
    expect(isWorkFamily("System Installation")).toBe(false);
  });
});

describe("buildDossierFallback (db)", () => {
  it("3284 Harborlight Hollow: last visit, callback as open issue, no equipment, warranty unknown", async () => {
    const d = await buildDossierFallback(HARBORLIGHT, NOW);
    expect(d).not.toBeNull();
    expect(d!.address_label).toBe("3284 Harborlight Hollow Ln, Miami Beach");
    expect(d!.customer).toEqual({ customer_id: "cus_53fab24f857243a2b2bc997f5667b04d", display_name: "Sylvia Blackwell", kind: "homeowner" });
    expect(d!.last_visit).toMatchObject({
      invoice_number: "4925",
      tech_names: ["Yvonne Aguilar"],
      summary: "Unit had a clogged drain line and a bad float switch I replaced switch owner approved and cleared drain",
      work_items: ["Clear Drain Line", "Replace safety switch"],
      status: "complete unrated",
    });
    expect(d!.last_visit!.date.slice(0, 10)).toBe("2026-07-28");
    expect(d!.visit_count_12m).toBe(3);
    expect(d!.equipment).toEqual([]);
    expect(d!.warranty.status).toBe("unknown");
    expect(d!.open_issues).toEqual(["Service callback on May 11th (job #3989): Arrived for no cool upstairs"]);
    expect(d!.recurring_issues).toEqual([]);
    expect(d!.open_balance_cents).toBe(0);
    expect(d!.upcoming).toEqual([]);
    expect(d!.access_notes).toBeNull();
    expect(d!.summary_md).toBeNull();
  });

  it("103 Grouper Landing: two-system install, equipment, covered warranty, redacted access notes", async () => {
    const d = await buildDossierFallback(GROUPER, NOW);
    expect(d!.address_label).toBe("103 Grouper Landing Rd, Casa de Egret, Key Biscayne");
    expect(d!.last_visit).toMatchObject({ invoice_number: "3724", tech_names: ["Alina Farrell"], description: "Visit #4" });
    expect(d!.equipment.map((e) => `${e.brand} ${e.tonnage} ${e.kind}`)).toEqual([
      "Carrier 2.5 heat pump condenser",
      "Carrier 2.5 air handler",
      "Carrier 1.5 heat pump condenser",
      "Carrier 1.5 air handler",
    ]);
    expect(d!.warranty.status).toBe("covered");
    expect(d!.warranty.install_job_id).toBe("job_dd4866dec6f44342b2f25bf506e4e9ff");
    expect(d!.recurring_issues).toEqual([]);
    expect(d!.access_notes?.sensitive).toBe(true);
    expect(d!.access_notes?.text).toMatch(/Door code: \[code\]/);
    expect(d!.access_notes?.text).not.toMatch(/\d{4}/);
  });

  it("205 Seagrape Hollow: callback yesterday, install upcoming tomorrow, deposit not counted as balance", async () => {
    const d = await buildDossierFallback(SEAGRAPE, NOW);
    expect(d!.open_issue_details[0]).toMatchObject({ kind: "callback", job_id: "job_c56b0b6f50844112ab3759f03918a9e2" });
    expect(d!.upcoming).toHaveLength(1);
    expect(d!.upcoming[0]).toMatchObject({ description: "System Installation", window_label: "Thursday September 3rd, 10 AM to noon" });
    expect(d!.upcoming[0].tech_names).toEqual(["Selena Hayes", "Tamara Porter", "Theo Graves"]);
    expect(d!.open_balance_cents).toBe(0);
    expect(d!.access_notes).toBeNull(); // "shower leaking in the garage" is not an access note
  });

  it("1860 Tidewater Landing: warranty-claim open issue and an open balance on that visit", async () => {
    const d = await buildDossierFallback(TIDEWATER, NOW);
    expect(d!.open_issues[0]).toMatch(/^Warranty claim on August 27th \(job #5194\)/);
    expect(d!.open_balance_cents).toBe(81500);
    expect(d!.open_balance_jobs).toBe(1);
    expect(d!.warranty.status).toBe("partially_covered");
  });

  it("returns null for an unknown address", async () => {
    expect(await buildDossierFallback("adr_nope", NOW)).toBeNull();
  });

  it("never leaks a raw door/gate code anywhere in the result", async () => {
    const ids = (await sql<{ id: string }[]>`
      select distinct j.address_id as id from notes n join jobs j on j.id = n.job_id
      where j.address_id is not null and n.content ~* 'door code|gate code|lockbox' limit 25`).map((r) => r.id);
    for (const id of ids) {
      const d = await buildDossierFallback(id, NOW);
      const blob = JSON.stringify({ ...d, access_notes: undefined });
      expect(blob).not.toMatch(/(door|gate)\s*code\s*[:#]?\s*\d{3,}/i);
      if (d!.access_notes) expect(d!.access_notes.text).not.toMatch(/\b\d{4,}\b/);
    }
  });

  it("p95 under 300 ms on the busiest addresses", async () => {
    const ids = (await sql<{ id: string }[]>`
      select address_id as id from jobs where address_id is not null group by 1 order by count(*) desc limit 40`).map((r) => r.id);
    const times: number[] = [];
    for (const id of ids) {
      const t0 = performance.now();
      await buildDossierFallback(id, NOW);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    expect(p95).toBeLessThan(300);
  }, 60_000);
});
