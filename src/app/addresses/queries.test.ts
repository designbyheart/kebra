import "dotenv/config";
import { describe, expect, it } from "vitest";
import { getAddressPage } from "./queries";
import { searchCustomers } from "@/app/customers/queries";
import { fallbackAddressSummary } from "@/lib/ui/dossier-summary";

const NOW = new Date("2026-09-02T16:00:00Z");
const GROUPER = "adr_4840691e98d443c2b4edcae6e86ced8a";
const STARFISH_UNIT = "adr_fe70474d4dba45dea549359ca16a74a4";

describe("address page data (db)", () => {
  it("103 Grouper Landing Rd: two-system install, equipment lines, warranty covered", async () => {
    const d = await getAddressPage(GROUPER, NOW);
    expect(d).not.toBeNull();
    expect(d!.dossier.address_label).toBe("103 Grouper Landing Rd, Casa de Egret, Key Biscayne");
    expect(d!.dossier.equipment.length).toBeGreaterThanOrEqual(2);
    expect(d!.dossier.warranty.status).toBe("covered");
    expect(d!.dossier.warranty.install_job_id).toBeTruthy();
    expect(d!.timeline.length).toBeGreaterThanOrEqual(2);
    expect(d!.timeline[0].date! >= d!.timeline[1].date!).toBe(true);
    expect(d!.serviceTypes.map((s) => s.id)).toContain("diagnostic");
    expect(d!.techs.length).toBeGreaterThan(5);
    const summary = fallbackAddressSummary(d!.dossier, NOW);
    expect(summary).toMatch(/Last visit/);
    expect(summary).toMatch(/Labor warranty runs to/);
  });

  it("a Starfish Hospitality unit carries the property-manager context", async () => {
    const d = await getAddressPage(STARFISH_UNIT, NOW);
    expect(d).not.toBeNull();
    expect(d!.bundle.customer.displayName).toBe("Starfish Hospitality");
    expect(d!.sites_count).toBeGreaterThan(50);
  });

  it("returns null for an unknown address", async () => {
    expect(await getAddressPage("adr_nope", NOW)).toBeNull();
  });
});

describe("customer search (db)", () => {
  it("finds Lighthouse Hospitality by name with balances and site counts", async () => {
    const r = await searchCustomers("Lighthouse Hospitality");
    expect(r.recent).toBe(false);
    expect(r.customers.length).toBeGreaterThan(0);
    expect(r.customers.every((c) => c.display_name === "Lighthouse Hospitality")).toBe(true);
    expect(r.customers[0].sites_count).toBeGreaterThan(0);
    expect(typeof r.customers[0].open_balance_cents).toBe("number");
  });

  it("matches an address query to the dossier page", async () => {
    const r = await searchCustomers("103 grouper landing");
    expect(r.addresses[0]?.address_id).toBe(GROUPER);
  });

  it("empty query lists recent customers", async () => {
    const r = await searchCustomers("");
    expect(r.recent).toBe(true);
    expect(r.customers.length).toBeGreaterThan(10);
  });
});
