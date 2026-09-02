import { describe, expect, it } from "vitest";
import {
  ADDRESS_OUTPUT_SCHEMA,
  CUSTOMER_OUTPUT_SCHEMA,
  DOSSIER_SYSTEM_PROMPT,
  MAX_OUTPUT_TOKENS,
  addressDossierOutput,
  buildAddressPrompt,
  buildAddressRequest,
  buildCustomerPrompt,
  buildCustomerRequest,
  customIdFor,
  customerDossierOutput,
  estimateTokens,
  extractAccessNotes,
  lastVisitAt,
  parseCustomId,
  redact,
  wordCount,
  type AddressCorpus,
  type CorpusJob,
  type CustomerCorpus,
} from "./dossier-prompt";

const TODAY = "2026-09-02";

function job(over: Partial<CorpusJob> & { id: string }): CorpusJob {
  return {
    invoiceNumber: "3871",
    description: "Service Call - Diagnostic",
    workStatus: "complete rated",
    scheduledStart: new Date("2026-04-21T17:30:00Z"),
    completedAt: new Date("2026-04-21T19:10:00Z"),
    tags: [],
    totalCents: 0,
    outstandingCents: 0,
    techs: ["Pace"],
    notes: [],
    items: [],
    ...over,
  };
}

const CORPUS: AddressCorpus = {
  addressId: "adr_1",
  label: "13 Saltbush Key, Miami, FL 33101",
  customer: { id: "cus_1", displayName: "Tidewater Hospitality", kind: "company" },
  jobs: [
    job({
      id: "job_b",
      invoiceNumber: "4694",
      description: "Preventative Maintenance - Residential",
      workStatus: "complete unrated",
      scheduledStart: new Date("2026-08-04T14:00:00Z"),
      completedAt: new Date("2026-08-05T15:05:53Z"),
      tags: ["Campaigns", "Pipeline Automation"],
      totalCents: 17900,
      invoiceStatus: "paid",
      techs: ["Yvonne"],
      notes: [
        { seq: 0, authorType: "office", content: "2 unit PM" },
        { seq: 1, authorType: "tech", content: "Blower motor on the west side is going out.\nSwapped the phase as a temp fix." },
      ],
      items: [{ name: "Preventative Maintenance - Residential", type: "labor", amountCents: 17900 }],
    }),
    job({
      id: "job_a",
      notes: [
        { seq: 0, authorType: "office", content: "Door code is [code], turn handle to right. Security knows Pace is coming." },
        { seq: 1, authorType: "tech", content: "CR2032 battery fine, t-stat still throwing error; ordered Redlink stat under warranty." },
        { seq: 2, authorType: "tech", content: "Installed thermostat, no charge." },
      ],
    }),
    job({
      id: "job_c",
      invoiceNumber: "5001",
      workStatus: "scheduled",
      scheduledStart: new Date("2026-09-10T13:00:00Z"),
      completedAt: null,
      techs: [],
    }),
  ],
};

describe("redact", () => {
  it("replaces phones, emails and links", () => {
    expect(redact("call 305-555-0142 or (305) 555 0142 or 3055550142")).toBe("call [phone] or [phone] or [phone]");
    expect(redact("mail jane.doe@example.com now")).toBe("mail [email] now");
    expect(redact("see https://example.com/x?y=1 ok")).toBe("see [link] ok");
  });

  it("replaces door and gate codes but keeps placeholders, invoice numbers and dates", () => {
    expect(redact("gate code 1234, door code is 4321#")).toBe("gate code [code], door code is [code]");
    expect(redact("Lockbox: 0000 on the rail; code *5566")).toBe("Lockbox: [code] on the rail; code [code]");
    expect(redact("Door code is [code], turn handle right")).toBe("Door code is [code], turn handle right");
    expect(redact("invoice #3871 booked 4/21, unit 36W, $179.00")).toBe("invoice #3871 booked 4/21, unit 36W, $179.00");
  });
});

describe("extractAccessNotes", () => {
  it("collects only access sentences, redacted and deduped", () => {
    const text = extractAccessNotes([
      { content: "Door code is [code], turn handle to right. Blower motor is going out." },
      { content: "Access info: Code for Saltbush Key is [code], turn handle right." },
      { content: "Door code is [code], turn handle to right." },
    ]);
    expect(text).toBe(
      "Door code is [code], turn handle to right. Access info: Code for Saltbush Key is [code], turn handle right.",
    );
    expect(extractAccessNotes([{ content: "Replaced capacitor." }])).toBeNull();
  });
});

describe("buildAddressPrompt", () => {
  it("renders header, jobs oldest first, techs, line items and notes in order", () => {
    const built = buildAddressPrompt(CORPUS, { today: TODAY });
    const u = built.user;
    expect(u).toContain("Today: 2026-09-02");
    expect(u).toContain("Address: 13 Saltbush Key, Miami, FL 33101");
    expect(u).toContain("Customer: Tidewater Hospitality (company)");
    expect(u).toContain("Jobs at this address: 3");
    // chronological order: 4/21 job, then 8/4 job, then the scheduled one
    const a = u.indexOf("### Job #3871 — 2026-04-21 — complete rated (completed 2026-04-21)");
    const b = u.indexOf("### Job #4694 — 2026-08-04 — complete unrated (completed 2026-08-05)");
    const c = u.indexOf("### Job #5001 — 2026-09-10 — scheduled");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(u).toContain("Techs: Yvonne");
    expect(u).toContain("Techs: unassigned");
    expect(u).toContain("Tags: Campaigns, Pipeline Automation");
    expect(u).toContain("Money: total $179.00, outstanding $0.00, invoice paid");
    expect(u).toContain("- Preventative Maintenance - Residential (labor) $179.00");
    // notes are one line each, in seq order, with the author tag
    expect(u).toContain("- [office] Door code is [code], turn handle to right. Security knows Pace is coming.");
    expect(u).toContain("- [tech] Blower motor on the west side is going out. Swapped the phase as a temp fix.");
    expect(u.indexOf("[office] 2 unit PM")).toBeLessThan(u.indexOf("[tech] Blower motor"));
    expect(u).toContain("# Output");
    expect(built.notesTotal).toBe(5);
    expect(built.notesOmitted).toBe(0);
    expect(built.estTokens).toBe(estimateTokens(u));
  });

  it("redacts raw codes and phones in notes before they reach the prompt", () => {
    const corpus: AddressCorpus = {
      ...CORPUS,
      jobs: [job({ id: "j", notes: [{ seq: 0, authorType: "office", content: "gate code 9876, call 305-555-0100" }] })],
    };
    const u = buildAddressPrompt(corpus, { today: TODAY }).user;
    expect(u).not.toContain("9876");
    expect(u).not.toContain("305-555-0100");
    expect(u).toContain("gate code [code], call [phone]");
  });

  it("drops the oldest notes first when over budget and never exceeds it", () => {
    const full = buildAddressPrompt(CORPUS, { today: TODAY });
    const budget = full.estTokens - 30;
    const cut = buildAddressPrompt(CORPUS, { today: TODAY, maxTokens: budget });
    expect(cut.estTokens).toBeLessThanOrEqual(budget);
    expect(cut.notesOmitted).toBeGreaterThan(0);
    expect(cut.notesOmitted).toBeLessThan(cut.notesTotal);
    // The oldest job's first note goes; the newest job's notes stay.
    expect(cut.user).not.toContain("Door code is [code], turn handle to right. Security knows");
    expect(cut.user).toContain("Swapped the phase as a temp fix");
    expect(cut.user).toMatch(/Notes \(\d+ shown, \d+ older omitted\)/);
  });

  it("degrades to headers only when the budget is tiny", () => {
    const cut = buildAddressPrompt(CORPUS, { today: TODAY, maxTokens: 1 });
    expect(cut.notesOmitted).toBe(cut.notesTotal);
    expect(cut.user).toContain("### Job #4694");
  });
});

describe("buildCustomerPrompt", () => {
  const corpus: CustomerCorpus = {
    customerId: "cus_1",
    displayName: "Tidewater Hospitality",
    kind: "company",
    company: "Tidewater Hospitality LLC",
    sites: [
      { addressId: "adr_1", label: "13 Saltbush Key, Miami, FL", jobCount: 2 },
      { addressId: "adr_2", label: "4 Harborlight Shores Blvd Unit 202, Miami, FL", jobCount: 1 },
    ],
    jobs: CORPUS.jobs.map((j, i) => ({ ...j, siteLabel: i === 2 ? "4 Harborlight Shores Blvd Unit 202, Miami, FL" : "13 Saltbush Key, Miami, FL" })),
    openBalanceCents: 45000,
  };

  it("lists sites and labels each job with its site", () => {
    const u = buildCustomerPrompt(corpus, { today: TODAY }).user;
    expect(u).toContain("Customer: Tidewater Hospitality (company), company: Tidewater Hospitality LLC");
    expect(u).toContain("Open balance across all jobs: $450.00");
    expect(u).toContain("Service sites (2):");
    expect(u).toContain("- 13 Saltbush Key, Miami, FL — 2 jobs");
    expect(u).toContain("- 4 Harborlight Shores Blvd Unit 202, Miami, FL — 1 job");
    expect(u).toContain("Site: 4 Harborlight Shores Blvd Unit 202, Miami, FL");
    expect(u).toContain("preferences.preferred_techs");
  });
});

describe("output schemas", () => {
  it("JSON schemas are closed objects with every property required", () => {
    for (const s of [ADDRESS_OUTPUT_SCHEMA, CUSTOMER_OUTPUT_SCHEMA]) {
      expect(s.additionalProperties).toBe(false);
      expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
    }
    const prefs = CUSTOMER_OUTPUT_SCHEMA.properties.preferences;
    expect(prefs.additionalProperties).toBe(false);
    expect([...prefs.required].sort()).toEqual(Object.keys(prefs.properties).sort());
  });

  it("zod accepts a conforming address dossier and rejects drift", () => {
    const good = {
      summary_md: "Last here Aug 5: Yvonne did a two-unit maintenance. Blower motor on the west side is failing.",
      last_visit_summary: "Aug 5, Yvonne serviced two systems and flagged a failing blower motor.",
      equipment: ["Redlink thermostat (installed Apr 2026)", "two split systems"],
      open_issues: ["West-side blower motor needs replacement"],
      recurring_issues: [],
      access_notes_present: true,
      warranty_notes: "Thermostat replaced under Johnstone warranty in April.",
      risk_flags: ["aging equipment"],
    };
    expect(addressDossierOutput.parse(good)).toEqual(good);
    expect(wordCount(good.summary_md)).toBeLessThanOrEqual(90);
    expect(addressDossierOutput.safeParse({ ...good, risk_flags: ["made up"] }).success).toBe(false);
    expect(addressDossierOutput.safeParse({ ...good, extra: 1 }).success).toBe(false);
    const { warranty_notes: _drop, ...missing } = good;
    void _drop;
    expect(addressDossierOutput.safeParse(missing).success).toBe(false);
  });

  it("zod accepts a conforming customer dossier", () => {
    const good = {
      summary_md: "Property manager with two Miami sites since April.",
      last_visit_summary: "Aug 5, Yvonne serviced Saltbush Key.",
      preferences: { preferred_techs: ["Pace"], scheduling: [], contact: ["Owner is the on-site contact"], billing: [] },
      open_issues: [],
      risk_flags: ["unpaid balance"],
    };
    expect(customerDossierOutput.parse(good)).toEqual(good);
    expect(customerDossierOutput.safeParse({ ...good, preferences: {} }).success).toBe(false);
  });
});

describe("batch requests", () => {
  it("builds a structured-output request keyed by custom_id", () => {
    const { request } = buildAddressRequest(CORPUS, { today: TODAY });
    expect(request.custom_id).toBe("addr-adr_1");
    expect(request.params.model).toBe("claude-opus-5");
    expect(request.params.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(request.params.system).toBe(DOSSIER_SYSTEM_PROMPT);
    expect(request.params.thinking).toEqual({ type: "adaptive" });
    expect(request.params.output_config?.format).toEqual({ type: "json_schema", schema: ADDRESS_OUTPUT_SCHEMA });
    expect(request.params.output_config?.effort).toBe("medium");
    expect(request.params.messages).toHaveLength(1);
    expect(request.params.messages[0].role).toBe("user");
    // no deprecated / removed knobs
    expect(request.params).not.toHaveProperty("output_format");
    expect(JSON.stringify(request.params)).not.toContain("budget_tokens");
  });

  it("customer requests use the customer schema and id prefix", () => {
    const corpus: CustomerCorpus = {
      customerId: "cus_9",
      displayName: "Ana Glover",
      kind: "homeowner",
      company: null,
      sites: [],
      jobs: [],
      openBalanceCents: 0,
    };
    const { request } = buildCustomerRequest(corpus, { today: TODAY, effort: "low" });
    expect(request.custom_id).toBe("cust-cus_9");
    expect(request.params.output_config?.format).toEqual({ type: "json_schema", schema: CUSTOMER_OUTPUT_SCHEMA });
    expect(request.params.output_config?.effort).toBe("low");
  });

  it("round-trips custom ids", () => {
    expect(parseCustomId(customIdFor("address", "adr_1"))).toEqual({ kind: "address", id: "adr_1" });
    expect(parseCustomId(customIdFor("customer", "cus_1"))).toEqual({ kind: "customer", id: "cus_1" });
    expect(parseCustomId("nope")).toBeNull();
  });
});

describe("lastVisitAt", () => {
  it("returns the newest completed job date and ignores scheduled ones", () => {
    expect(lastVisitAt(CORPUS.jobs)?.toISOString()).toBe("2026-08-05T15:05:53.000Z");
    expect(lastVisitAt([job({ id: "x", workStatus: "scheduled", completedAt: null })])).toBeNull();
  });
});
