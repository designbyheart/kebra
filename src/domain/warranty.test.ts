/**
 * Warranty rules and equipment extraction, unit-tested on price-book strings
 * and end-to-end on ten hand-picked addresses from the imported data
 * (2 installs, 2 Warranty Claim, 2 Service Callback, 2 plain repairs,
 * 2 property-management units).
 */
import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  INSTALL_RE,
  checkWarranty,
  deriveWarranty,
  extractEquipment,
  isEquipmentLine,
  isInstallFamily,
  parseEquipmentLine,
  warrantySpeech,
  type Warranty,
} from "./warranty";
import { loadAddressBundle } from "./history";

const NOW = new Date("2026-09-02T16:00:00Z");

describe("classification", () => {
  it("recognises HVAC system installs but not the 'Repairs & Part Installation' prefix or plumbing installs", () => {
    expect(INSTALL_RE.test("System Installation")).toBe(true);
    expect(INSTALL_RE.test("New System Installation - System Installation")).toBe(true);
    expect(INSTALL_RE.test("Service Calls - Repairs & Part Installation - Tier 3 Repair - Clear Drain Line")).toBe(false);
    expect(INSTALL_RE.test("Install New 1/4 Turn Hose Bibb")).toBe(false);
    expect(INSTALL_RE.test("Customer supplied toilet install")).toBe(false);
    expect(isInstallFamily({ description: "Service & Repair Fee - Standard" }, [])).toBe(false);
  });
  it("treats equipment material lines as install-family and ignores parts that only mention equipment words", () => {
    const eq = { name: "Carrier Coastal Heat Pump - 2.5 Ton Condenser - 15 SEER", type: "material" };
    expect(isEquipmentLine(eq)).toBe(true);
    expect(isEquipmentLine({ name: "Comfort Series Fan Coil Multipoise, ECM Motor for Puron Advance - 2.5 Ton", type: "material" })).toBe(true);
    expect(isEquipmentLine({ name: "Unit Specific Parts - Condenser Fan Motor", type: "material" })).toBe(false);
    expect(isEquipmentLine({ name: "Add Ons - Metal Air Handler Stand", type: "material" })).toBe(false);
    expect(isEquipmentLine({ name: "WARRANTY Parts / Service - WARRANTY - Compressor", type: "material" })).toBe(false);
    expect(isEquipmentLine({ name: "System Installation", type: "labor" })).toBe(false);
  });
});

describe("parseEquipmentLine", () => {
  it("extracts brand, tonnage, SEER and kind from price-book names", () => {
    expect(parseEquipmentLine("3 Ton - STANDARD 15 - Trane 3 Ton 15.2 Seer2 (16 SEER) Heat Pump System")).toMatchObject({
      brand: "Trane",
      tonnage: 3,
      seer: 16,
      kind: "heat pump system",
    });
    expect(parseEquipmentLine("Carrier Coastal Heat Pump - 2.5 Ton Condenser - 15 SEER")).toMatchObject({
      brand: "Carrier",
      tonnage: 2.5,
      seer: 15,
      kind: "heat pump condenser",
    });
    expect(parseEquipmentLine("1.5 Ton - Comfort Series Fan Coil Multipoise, ECM Motor for Puron Advance - 1.5 Ton")).toMatchObject({
      tonnage: 1.5,
      kind: "air handler",
    });
    expect(parseEquipmentLine("3 Ton Goodman Package unit")).toMatchObject({ brand: "Goodman", tonnage: 3, kind: "package unit" });
    expect(parseEquipmentLine("Carrier - Carrier 1 Ton Water Source HVAC Heat Pump")).toMatchObject({ brand: "Carrier", tonnage: 1, kind: "heat pump" });
  });
});

type Expect = {
  name: string;
  address_id: string;
  group: string;
  status: Warranty["status"];
  labor: boolean;
  parts: boolean | "likely";
  registered: boolean | "unknown";
  office: boolean;
  minEvidence: number;
  installJob?: string;
  laborUntil?: string;
  equipment?: { brand: string; tonnage: number; kind: string }[];
};

const CASES: Expect[] = [
  {
    name: "103 Grouper Landing Rd (invoice 3520, two-system install, Registration Complete)",
    group: "install",
    address_id: "adr_4840691e98d443c2b4edcae6e86ced8a",
    status: "covered",
    labor: true,
    parts: "likely",
    registered: true,
    office: false,
    minEvidence: 2,
    installJob: "job_dd4866dec6f44342b2f25bf506e4e9ff",
    laborUntil: "2027-03-02",
    equipment: [
      { brand: "Carrier", tonnage: 2.5, kind: "heat pump condenser" },
      { brand: "Carrier", tonnage: 2.5, kind: "air handler" },
      { brand: "Carrier", tonnage: 1.5, kind: "heat pump condenser" },
      { brand: "Carrier", tonnage: 1.5, kind: "air handler" },
    ],
  },
  {
    name: "515 Cormorant Reef Blvd 807 (invoice 5247, install, Registration Needed)",
    group: "install",
    address_id: "adr_05d654d020f24d778511c999df8e4395",
    status: "covered",
    labor: true,
    parts: "likely",
    registered: false,
    office: true,
    minEvidence: 2,
    installJob: "job_c15f866513404fecb628ebc0fc452142",
    laborUntil: "2027-08-24",
    equipment: [{ brand: "Carrier", tonnage: 1, kind: "heat pump" }],
  },
  {
    name: "1860 Tidewater Landing Dr (Warranty Claim, control board)",
    group: "warranty claim",
    address_id: "adr_3ced064501d8450ea46a723cb476540e",
    status: "partially_covered",
    labor: false,
    parts: "likely",
    registered: "unknown",
    office: true,
    minEvidence: 2,
  },
  {
    name: "89 Manatee Ridge Ln (two Warranty Claims, WARRANTY TXV + coil lines)",
    group: "warranty claim",
    address_id: "adr_24e9f068c56046b295964b215b6d9c3d",
    status: "partially_covered",
    labor: false,
    parts: "likely",
    registered: "unknown",
    office: true,
    minEvidence: 6,
  },
  {
    name: "205 Seagrape Hollow St (Service Callback, install scheduled tomorrow)",
    group: "callback",
    address_id: "adr_2d7a0e636f9c4c57ae7ba869142f0355",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 0,
  },
  {
    name: "115 Moonraker Dr (Service Callback)",
    group: "callback",
    address_id: "adr_d04867674e2744f799d91f33dca43379",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 1,
  },
  {
    name: "970 Tidewater Cay Rd (plain capacitor)",
    group: "repair",
    address_id: "adr_4824d38eddb84b078bc713bfcc837684",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 0,
  },
  {
    name: "316 Wahoo Bluff Blvd (PM + capacitor)",
    group: "repair",
    address_id: "adr_befa06a15b854fc087abebe5d15e2cac",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 0,
  },
  {
    name: "4311 Banyan Ridge Blvd 106 (Lighthouse Hospitality)",
    group: "property management",
    address_id: "adr_d90a4549de3541e3b36bb52a0ccb3ea2",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 0,
  },
  {
    name: "56 Amberjack Key Ln 16B (Saltmarsh Hospitality)",
    group: "property management",
    address_id: "adr_055e8b08c6de4ebba15afb4bc4c3a4f0",
    status: "unknown",
    labor: false,
    parts: false,
    registered: "unknown",
    office: true,
    minEvidence: 1,
  },
];

describe("checkWarranty on ten hand-picked addresses (db)", () => {
  for (const c of CASES) {
    it(`${c.group}: ${c.name}`, async () => {
      const w = await checkWarranty(c.address_id, NOW);
      expect(w).not.toBeNull();
      expect(w!.status).toBe(c.status);
      expect(w!.labor.covered).toBe(c.labor);
      expect(w!.parts.covered).toBe(c.parts);
      expect(w!.parts.registered).toBe(c.registered);
      expect(w!.needs_office_confirmation).toBe(c.office);
      expect(w!.evidence.length).toBeGreaterThanOrEqual(c.minEvidence);
      if (c.installJob) expect(w!.install_job_id).toBe(c.installJob);
      if (c.laborUntil) expect(w!.labor.until?.slice(0, 10)).toBe(c.laborUntil);
      if (c.equipment) {
        expect(w!.equipment.map((e) => ({ brand: e.brand, tonnage: e.tonnage, kind: e.kind }))).toEqual(c.equipment);
      }
      // every evidence item points at a real job and is speakable
      for (const e of w!.evidence) {
        expect(e.job_id).toMatch(/^job_/);
        expect(e.text.length).toBeGreaterThan(5);
        expect(e.text).not.toMatch(/\n/);
      }
      const speech = warrantySpeech(w!, w!.equipment, NOW);
      expect(speech).toMatch(/[.!]$/);
      if (c.office) expect(speech).toMatch(/office|confirm/i);
      if (c.status === "unknown") expect(speech).not.toMatch(/\bis covered\b/);
    });
  }

  it("speaks the covered case with the install date and registration", async () => {
    const w = await checkWarranty("adr_4840691e98d443c2b4edcae6e86ced8a", NOW);
    expect(warrantySpeech(w!, w!.equipment, NOW)).toBe(
      "Labor is covered until March 2nd, 2027 on the two systems we installed March 2nd, and it's registered, so the manufacturer parts warranty should apply too.",
    );
  });

  it("flips to labor-expired / parts-likely and then expired as time passes", async () => {
    const bundle = await loadAddressBundle("adr_4840691e98d443c2b4edcae6e86ced8a");
    const later = deriveWarranty(bundle!, new Date("2028-01-01T00:00:00Z"));
    expect(later.status).toBe("partially_covered");
    expect(later.labor.covered).toBe(false);
    expect(later.parts.covered).toBe("likely");
    expect(warrantySpeech(later, [], new Date("2028-01-01T00:00:00Z"))).toMatch(/labor warranty .* has passed/);
    const old = deriveWarranty(bundle!, new Date("2037-01-01T00:00:00Z"));
    expect(old.status).toBe("expired");
    expect(old.parts.covered).toBe(false);
  });

  it("dedupes equipment across the duplicate invoices on job 3520", async () => {
    const bundle = await loadAddressBundle("adr_4840691e98d443c2b4edcae6e86ced8a");
    const eq = extractEquipment(bundle!);
    expect(eq).toHaveLength(4);
    expect(new Set(eq.map((e) => e.source_job_id))).toEqual(new Set(["job_dd4866dec6f44342b2f25bf506e4e9ff"]));
    expect(eq.every((e) => e.installed_at?.startsWith("2026-03-02"))).toBe(true);
  });

  it("returns null for an unknown address", async () => {
    expect(await checkWarranty("adr_nope", NOW)).toBeNull();
  });
});
