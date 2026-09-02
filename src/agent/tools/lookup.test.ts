import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/db";
import { registry, type ToolContext } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { tools } from "./lookup";
import { speakStreet } from "./find-address";
import { maskPhone } from "./find-customer";
import { runImport } from "../../../scripts/import";

const ctx: ToolContext = { callId: null, actor: "agent", actorId: "vapi" };
const STARFISH = "cus_3fa02a2e5e944cb1952b019a40d3afc5";
const TEST_PHONE = "+13055550142";

type AddressResult = {
  candidates: { address_id: string; label: string; confidence: number }[];
  needs_unit: boolean;
  units: string[];
  speech_hint: string;
};
type CustomerResult = {
  candidates: { customer_id: string; display_name: string; matched_by: string }[];
  speech_hint: string;
};

async function run<T>(name: string, input: unknown, c: ToolContext = ctx): Promise<T> {
  const def = registry[name];
  const parsed = def.input.safeParse(input);
  if (!parsed.success) throw new Error(`invalid input for ${name}: ${JSON.stringify(parsed.error.issues)}`);
  return (await def.handler(parsed.data, c)) as T;
}

beforeAll(async () => {
  const [{ n }] = await sql<{ n: string }[]>`select count(*)::text as n from addresses`;
  if (Number(n) === 0) await runImport();
}, 120_000);

afterAll(async () => {
  await sql`delete from events where type = 'customer.phone_added' and entity_id = ${STARFISH} and payload->>'phone_masked' = ${maskPhone(TEST_PHONE)}`;
  await sql`delete from customer_phones where customer_id = ${STARFISH} and phone = ${TEST_PHONE}`;
});

describe("lookup tool registration", () => {
  it("registers find_address, find_customer and save_caller_phone", () => {
    for (const name of ["find_address", "find_customer", "save_caller_phone"]) {
      expect(tools[name]).toBeDefined();
      expect(registry[name]).toBe(tools[name]);
      expect(registry[name].description.length).toBeGreaterThan(40);
    }
  });

  it("validates inputs", () => {
    expect(registry.find_address.input.safeParse({}).success).toBe(false);
    expect(registry.find_address.input.safeParse({ query: "3284 harborlight" }).success).toBe(true);
    expect(registry.find_customer.input.safeParse({}).success).toBe(false);
    expect(registry.find_customer.input.safeParse({ phone: "305-555-0142" }).success).toBe(false);
    expect(registry.find_customer.input.safeParse({ phone: "+13055550142" }).success).toBe(true);
    expect(registry.save_caller_phone.input.safeParse({ customer_id: STARFISH, phone: "3055550142" }).success).toBe(false);
    expect(registry.save_caller_phone.input.safeParse({ customer_id: STARFISH, phone: TEST_PHONE, label: "mobile" }).success).toBe(
      true,
    );
  });
});

describe("find_address tool", () => {
  it("reads a confident match back for confirmation", async () => {
    const r = await run<AddressResult>("find_address", { query: "3284 Harborlight Hollow" });
    expect(r.candidates[0].address_id).toBe("adr_04dde9629abe496f99b95a5a9e94a3f0");
    expect(r.speech_hint).toMatch(/^I have 3284 Harborlight Hollow Lane, in Miami Beach\. Is that right\?$/);
    expect(r.needs_unit).toBe(false);
  });

  it("asks for the unit at a multi-unit building", async () => {
    const r = await run<AddressResult>("find_address", { query: "10254 east old mangrove road" });
    expect(r.needs_unit).toBe(true);
    expect(r.speech_hint).toMatch(/several units/);
    expect(r.speech_hint).toMatch(/Which unit/);
    expect(r.speech_hint).toMatch(/36W/);
  });

  it("uses the unit argument to pick the right door", async () => {
    const r = await run<AddressResult>("find_address", { query: "10254 east old mangrove road", unit: "36W" });
    expect(r.candidates[0].address_id).toBe("adr_b28b33a517b34df8bfcbab3b584e6d34");
    expect(r.needs_unit).toBe(false);
  });

  it("hedges on a weak match and throws not_found on nothing", async () => {
    const weak = await run<AddressResult>("find_address", { query: "harborlight" });
    expect(weak.speech_hint).toMatch(/closest I have|two close matches|several units/);
    await expect(run("find_address", { query: "qzxv wprtk" })).rejects.toMatchObject({
      code: "not_found",
      speechHint: expect.stringMatching(/spell the street/),
    });
    try {
      await run("find_address", { query: "qzxv wprtk" });
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).status).toBe(404);
    }
  });

  it("speaks abbreviations in full", () => {
    expect(speakStreet("10254 E Old Mangrove Rd")).toBe("10254 East Old Mangrove Road");
    expect(speakStreet("4 Harborlight Shores Blvd S")).toBe("4 Harborlight Shores Boulevard South");
  });
});

describe("find_customer + save_caller_phone", () => {
  it("finds a customer by company name", async () => {
    const r = await run<CustomerResult>("find_customer", { company: "Starfish Hospitality" });
    expect(r.candidates[0].customer_id).toBe(STARFISH);
    expect(r.speech_hint).toMatch(/Starfish Hospitality|Tidewater Hospitality/);
  });

  it("throws not_found for an unknown phone with a helpful hint", async () => {
    await expect(run("find_customer", { phone: "+19999999999" })).rejects.toMatchObject({
      code: "not_found",
      speechHint: expect.stringMatching(/name|address/),
    });
  });

  it("saves a caller phone (idempotently), emits one event, and is then findable by phone", async () => {
    const first = await run<{ saved: boolean; phone_masked: string; speech_hint: string }>("save_caller_phone", {
      customer_id: STARFISH,
      phone: TEST_PHONE,
      label: "mobile",
    });
    expect(first.saved).toBe(true);
    expect(first.phone_masked).toBe("+1 (305) •••-0142");
    expect(first.speech_hint).toMatch(/saved/);

    const again = await run<{ saved: boolean }>("save_caller_phone", { customer_id: STARFISH, phone: TEST_PHONE });
    expect(again.saved).toBe(true);

    const rows = await sql<{ label: string | null; source: string }[]>`
      select label, source from customer_phones where customer_id = ${STARFISH} and phone = ${TEST_PHONE}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("mobile"); // second save without a label keeps the first
    expect(rows[0].source).toBe("agent");

    const evs = await sql<{ payload: Record<string, unknown>; actor: string }[]>`
      select payload, actor from events
      where type = 'customer.phone_added' and entity_id = ${STARFISH} and payload->>'phone_masked' = ${maskPhone(TEST_PHONE)}
      order by id`;
    expect(evs.length).toBe(2); // one per write call
    expect(evs[0].actor).toBe("agent");
    expect(evs[0].payload.summary).toMatch(/Saved \+1 \(305\) •••-0142/);
    expect(JSON.stringify(evs)).not.toContain(TEST_PHONE); // full number never in payloads

    const found = await run<CustomerResult>("find_customer", { phone: TEST_PHONE });
    expect(found.candidates[0].customer_id).toBe(STARFISH);
    expect(found.candidates[0].matched_by).toBe("phone");
    expect(found.speech_hint).toMatch(/this number under/);
  });

  it("rejects an unknown customer", async () => {
    await expect(run("save_caller_phone", { customer_id: "cus_nope", phone: TEST_PHONE })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("masks phones for payloads", () => {
    expect(maskPhone("+13055551234")).toBe("+1 (305) •••-1234");
    expect(maskPhone("+442071234567")).toMatch(/^\+44 ••• 4567$/);
  });
});
