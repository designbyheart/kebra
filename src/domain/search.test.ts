/**
 * Runs against the real local database (DATABASE_URL in .env). If the
 * addresses table is empty the import is run first so the suite is
 * self-sufficient on a fresh checkout.
 */
import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/db";
import { extractUnitToken, findAddress, findCustomer, normalizeUnit, unitMatches } from "./search";
import { runImport } from "../../scripts/import";

type Case = {
  q: string;
  expect: string | string[];
  opts?: { unit?: string; city?: string; customerId?: string };
  minConfidence?: number;
  note?: string;
};

// Spoken-style queries -> expected top address_id. Ids come from
// front-desk-assignment/data (see README) and are stable across imports.
const CASES: Case[] = [
  { q: "3284 Harborlight Hollow", expect: "adr_04dde9629abe496f99b95a5a9e94a3f0", minConfidence: 0.85 },
  {
    q: "thirty two eighty four harborlight hollow lane coral gables",
    expect: "adr_04dde9629abe496f99b95a5a9e94a3f0",
    note: "wrong city spoken (it is Miami Beach); number + street must still win",
  },
  { q: "10254 East Old Mangrove unit 36W", expect: "adr_b28b33a517b34df8bfcbab3b584e6d34" },
  { q: "ten two five four old mangrove road high pointe 422", expect: "adr_bc4e4c2649904f40b386f6f2c5642dfa" },
  { q: "89 harborlight shores", expect: "adr_ec51b6c026484af5848ae837c6fe6e05", minConfidence: 0.85 },
  {
    q: "4 Harborlight Shores Boulevard South",
    // The same site exists twice under two ids (both "Unit 202"); either is right.
    expect: ["adr_cb8b02b0f31f4ec2ace15331525b26cf", "adr_af3449e50aa74ecda6d0b3800d2a2ea5"],
  },
  { q: "1231 Harborlight Cay Road 283", expect: "adr_03314c2a128c4141b4a958857d59af46", minConfidence: 0.85 },
  // 13 more across cities
  { q: "twenty three east cowrie cove street coral gables", expect: "adr_ad78d5dee59f402ea614b24bb0f8e6f7" },
  { q: "93 seashell landing", expect: "adr_574a1e7f7b6c4f768fac543ccfd09ad5" },
  { q: "fifty one whitecap reef lane", expect: "adr_8dead77d04a94996b9c7b7430bdf43e4" },
  { q: "48 whitecap glen cutler bay", expect: "adr_83d768ebc52b441ab56262a06fcfdec6" },
  { q: "seventy halyard isle circle", expect: "adr_dfa9973afce24c5fa75f1c058da3a7ea" },
  { q: "4311 banyan ridge boulevard unit 43 fort lauderdale", expect: "adr_e082bca1bae3431495757a0f39097033" },
  { q: "13555 keel hollow drive 21C", expect: "adr_bb01373dd99449a181241cab25b0cb50" },
  { q: "three oh two cowrie cay road hialeah", expect: "adr_e87ff5bef4094001a37c5b0c77c13bef" },
  { q: "101 glasswort terrace homestead", expect: "adr_baf272bdf2604bb38171e3719783583d" },
  { q: "585 moonraker reef boulevard suite 201 key biscayne", expect: "adr_9aeb13c3befd45b880d3fc30dcce832d" },
  { q: "ninety rudder ridge drive east miami beach", expect: "adr_afba07d2782f44ffbda1df1e57b22c2e" },
  { q: "125 plumeria glen drive unit 109", expect: "adr_59736d1e3feb4226b041a18d910d76d8" },
  { q: "8504 east old mangrove palmetto bay", expect: "adr_59039bfe51c64538aab05cc055d67543" },
  { q: "eighty one hibiscus bluff road pinecrest", expect: "adr_39e0ac51e2c949e1b170cc5cc0b54e84" },
  { q: "321 seafoam landing doral", expect: "adr_1237cb484e544315bd95c668a45117e8" },
  { q: "8577 bowline landing blvd unit 101 aventura", expect: "adr_34ce3a67d6ac4dfb9ec4d166fc379986" },
  { q: "firebush pointe two unit 4252", expect: "adr_7a475c96edc2460c8a4cd170f581277c", note: "no house number" },
  { q: "29 oleander ridge lane kendall", expect: "adr_1580ccd3902240c595b0af1aa720dd3a" },
  { q: "10343 east old mangrove", opts: { unit: "B324" }, expect: "adr_fe70474d4dba45dea549359ca16a74a4" },
  { q: "3880 old mangrove", opts: { unit: "505" }, expect: ["adr_dc62387418e84d2db41961a51c86e732", "adr_715256f0829d45ef8ec253a382e7fe6f"] },
];

async function ensureData() {
  const [{ n }] = await sql<{ n: string }[]>`select count(*)::text as n from addresses`;
  if (Number(n) === 0) {
    await runImport({ log: (s) => console.log(`[search.test import] ${s}`) });
  }
}

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

describe("findAddress", () => {
  beforeAll(ensureData, 120_000);

  const timings: number[] = [];

  for (const c of CASES) {
    it(`"${c.q}"${c.opts ? ` ${JSON.stringify(c.opts)}` : ""} -> top candidate${c.note ? ` (${c.note})` : ""}`, async () => {
      const t0 = performance.now();
      const r = await findAddress(c.q, c.opts);
      timings.push(performance.now() - t0);
      const expected = Array.isArray(c.expect) ? c.expect : [c.expect];
      const top = r.candidates[0];
      expect(top, `no candidates for "${c.q}" (normalized "${r.normalized_query}")`).toBeDefined();
      expect(
        expected,
        `top was ${top.address_id} ${top.label} (${top.confidence}); next: ${r.candidates
          .slice(1, 3)
          .map((x) => `${x.address_id} ${x.label} (${x.confidence})`)
          .join(" | ")}`,
      ).toContain(top.address_id);
      expect(top.confidence).toBeGreaterThanOrEqual(0);
      expect(top.confidence).toBeLessThanOrEqual(1);
      expect(r.candidates.length).toBeLessThanOrEqual(5);
      if (c.minConfidence) expect(top.confidence).toBeGreaterThanOrEqual(c.minConfidence);
    });
  }

  it("logs timings and stays under the 150 ms p95 budget", async () => {
    // Warm the connection/plan cache, then time a second full pass.
    for (const c of CASES.slice(0, 3)) await findAddress(c.q, c.opts);
    const pass: number[] = [];
    for (const c of CASES) {
      const t0 = performance.now();
      await findAddress(c.q, c.opts);
      pass.push(performance.now() - t0);
    }
    const all = [...timings, ...pass];
    const p50 = percentile(pass, 0.5);
    const p95 = percentile(pass, 0.95);
    console.log(
      `[find_address timings] n=${pass.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${Math.max(...pass).toFixed(1)}ms ` +
        `(first pass incl. cold start: p95=${percentile(all, 0.95).toFixed(1)}ms)`,
    );
    expect(p95).toBeLessThan(150);
  });

  it("asks for the unit on a multi-unit building when none was given", async () => {
    const r = await findAddress("10254 east old mangrove road");
    expect(r.candidates[0].street).toMatch(/10254/);
    expect(r.needs_unit).toBe(true);
    // Six units exist at 10254; all must be listed even though only 5 candidates come back.
    expect(r.units.length).toBe(6);
    expect(r.units.map(normalizeUnit)).toEqual(expect.arrayContaining(["36w", "42w"].map((u) => expect.stringContaining(u))));
  });

  it("reads the unit out of the query and does not ask again", async () => {
    const r = await findAddress("1231 Harborlight Cay Road 283");
    expect(r.needs_unit).toBe(false);
    const u = await findAddress("10254 east old mangrove road unit 36 W");
    expect(u.candidates[0].address_id).toBe("adr_b28b33a517b34df8bfcbab3b584e6d34");
    expect(u.needs_unit).toBe(false);
  });

  it("extracts unit tokens from spoken queries", () => {
    expect(extractUnitToken("10254 e old mangrove unit 36w")).toBe("36w");
    expect(extractUnitToken("1231 harborlight cay rd 283")).toBe("283");
    expect(extractUnitToken("13555 keel hollow dr 21c")).toBe("21c");
    expect(extractUnitToken("3284 harborlight hollow ln miami beach 33182")).toBe("");
    expect(extractUnitToken("3880 old mangrove")).toBe("");
    expect(extractUnitToken("whatever", "Unit #8B")).toBe("8b");
    expect(unitMatches("High Pointe Unit 36W", "36w")).toBe("exact");
    expect(unitMatches("Building G unit 375", "375")).toBe("exact");
    expect(unitMatches("Unit 325", "36w")).toBe("none");
  });

  it("does not ask for the unit once one is given", async () => {
    const r = await findAddress("10254 east old mangrove road", { unit: "42W" });
    expect(r.candidates[0].address_id).toBe("adr_d05d432c14964faca102d6edf204cc96");
    expect(r.needs_unit).toBe(false);
  });

  it("boosts the caller's own sites when customer_id is known", async () => {
    // Starfish Hospitality manages several Old Mangrove units.
    const r = await findAddress("old mangrove road", { customerId: "cus_3fa02a2e5e944cb1952b019a40d3afc5" });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0].customer_id).toBe("cus_3fa02a2e5e944cb1952b019a40d3afc5");
  });

  it("boosts the city when given", async () => {
    const r = await findAddress("harborlight hollow lane", { city: "Key Biscayne" });
    expect(r.candidates[0].city).toBe("Key Biscayne");
  });

  it("returns nothing for gibberish or empty input", async () => {
    expect((await findAddress("")).candidates).toEqual([]);
    expect((await findAddress("qzxv wprtk")).candidates).toEqual([]);
  });

  it("clamps confidence and sorts descending", async () => {
    const r = await findAddress("3284 harborlight hollow lane miami beach");
    const conf = r.candidates.map((c) => c.confidence);
    expect(conf.every((c) => c >= 0 && c <= 1)).toBe(true);
    expect([...conf].sort((a, b) => b - a)).toEqual(conf);
  });
});

describe("findCustomer", () => {
  beforeAll(ensureData, 120_000);

  it("matches a company by trigram", async () => {
    const r = await findCustomer({ name: "Starfish Hospitality" });
    expect(r[0].customer_id).toBe("cus_3fa02a2e5e944cb1952b019a40d3afc5");
    expect(r[0].sites_count).toBeGreaterThan(1);
    expect(r[0].matched_by).toBe("name");
  });

  it("tolerates misheard names", async () => {
    const r = await findCustomer({ company: "star fish hospitalty" });
    expect(r.map((c) => c.customer_id)).toContain("cus_3fa02a2e5e944cb1952b019a40d3afc5");
  });

  it("returns [] with no criteria or an unknown phone", async () => {
    expect(await findCustomer({})).toEqual([]);
    expect(await findCustomer({ phone: "+19999999999" })).toEqual([]);
  });
});
