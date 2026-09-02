/**
 * Pure helpers plus read queries against the real local database
 * (DATABASE_URL in .env, data imported by W1-A).
 */
import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  dollars,
  firstSentence,
  getJob,
  getJobNotes,
  getOpenBalance,
  getVisitHistory,
  joinSpoken,
  numberWord,
  oneLine,
  ordinal,
  pickTechNote,
  redact,
  spokenDate,
  spokenDay,
  spokenTime,
  spokenWindow,
  windowEnd,
} from "./history";

const NOW = new Date("2026-09-02T16:00:00Z"); // Wed Sep 2, noon ET
const HARBORLIGHT = "adr_04dde9629abe496f99b95a5a9e94a3f0";
const JOB_4925 = "job_15a0d32e03cb4cb597f39ba187b934d8";
const THEO_LEVINE = "cus_1abe4bb4a17843f8983cf33f1acd318e";
const SYLVIA = "cus_53fab24f857243a2b2bc997f5667b04d";

const note = (content: string, authorType: "tech" | "office" = "tech", seq = 0) => ({ authorType, content, seq });

describe("redact", () => {
  it("masks phones, emails and access codes but keeps existing tokens", () => {
    expect(redact("call 305-555-0142 or (305) 555 0142")).toBe("call [phone] or [phone]");
    expect(redact("email jane.doe@example.com")).toBe("email [email]");
    expect(redact("Door code: 4521, gate code #9876")).toBe("Door code: [code], gate code #[code]");
    expect(redact("the code is 5566 for the side gate")).toBe("the code is [code] for the side gate");
    expect(redact("Lockbox 0987 on the rail")).toBe("Lockbox [code] on the rail");
    expect(redact("Door code: [code]")).toBe("Door code: [code]");
  });
  it("leaves ordinary numbers alone", () => {
    expect(redact("Replaced 70/5mfd dual run cap, 19 degree split")).toBe("Replaced 70/5mfd dual run cap, 19 degree split");
  });
});

describe("firstSentence / oneLine", () => {
  it("takes the first sentence of the first real line, stripping bullets and headers", () => {
    expect(firstSentence("* systems ran well. Then more.")).toBe("systems ran well.");
    expect(firstSentence("Gerald's notes: 1 September 2026: SJ\nFound clogged drain line and tripped switch\nCleared drain line")).toBe(
      "Found clogged drain line and tripped switch",
    );
    expect(firstSentence("Arrived for no cool\n\nDiscovered a bad blower control board.")).toBe("Arrived for no cool");
  });
  it("cuts at 140 characters on a word boundary", () => {
    const long = `${"word ".repeat(40)}end.`;
    const s = firstSentence(long);
    expect(s.length).toBeLessThanOrEqual(140);
    expect(s.endsWith("…")).toBe(true);
  });
  it("prefers the last substantive tech note and skips housekeeping", () => {
    const notes = [
      note("guest states air handler is leaking water", "office", 0),
      note("Unit had a clogged drain line and a bad float switch I replaced switch owner approved and cleared drain\nUnit is now draining", "tech", 1),
      note("Sent reme estimate per note and sent invoice", "tech", 2),
      note("Followed up in HCP", "tech", 3),
    ];
    expect(pickTechNote(notes)?.seq).toBe(1);
    expect(oneLine(notes, "Diagnostic")).toBe("Unit had a clogged drain line and a bad float switch I replaced switch owner approved and cleared drain");
  });
  it("falls back to the description, then a neutral label, and redacts", () => {
    expect(oneLine([], "Tier 3 Repair - Capacitor Replacement")).toBe("Tier 3 Repair - Capacitor Replacement");
    expect(oneLine([], "")).toBe("Service visit");
    expect(oneLine([note("Door code 4521 works, unit cooling fine after reset of breaker.")], null)).toBe("Door code [code] works, unit cooling fine after reset of breaker.");
  });
});

describe("speech helpers", () => {
  it("speaks dates, times and windows in ET", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(23)).toBe("23rd");
    expect(spokenDate("2026-07-28T01:05:57Z", { now: NOW })).toBe("July 27th");
    expect(spokenDate("2027-03-02T22:13:00Z", { now: NOW })).toBe("March 2nd, 2027");
    expect(spokenDate("2026-09-03T14:00:00Z", { weekday: true, now: NOW })).toBe("Thursday September 3rd");
    expect(spokenTime("2026-09-02T14:00:00Z")).toBe("10 AM");
    expect(spokenTime("2026-09-02T16:00:00Z")).toBe("noon");
    expect(spokenTime("2026-09-02T18:30:00Z")).toBe("2:30 PM");
    expect(spokenWindow("2026-09-03T14:00:00Z", "2026-09-03T16:00:00Z", NOW)).toBe("Thursday September 3rd, 10 AM to noon");
    expect(spokenDay("2026-09-02T20:00:00Z", NOW)).toBe("today");
    expect(spokenDay("2026-09-03T14:00:00Z", NOW)).toBe("tomorrow");
    expect(spokenDay("2026-09-08T14:00:00Z", NOW)).toBe("Tuesday September 8th");
  });
  it("formats money, numbers and lists", () => {
    expect(dollars(20893)).toBe("$208.93");
    expect(dollars(1817490)).toBe("$18,174.90");
    expect(dollars(1000)).toBe("$10");
    expect(numberWord(10)).toBe("ten");
    expect(numberWord(37)).toBe("37");
    expect(joinSpoken(["Theo", "Tamara", "Selena"])).toBe("Theo, Tamara and Selena");
  });
  it("derives the arrival window end from arrival_window minutes", () => {
    const start = new Date("2026-09-02T14:00:00Z");
    expect(windowEnd({ scheduledStart: start, scheduledEnd: new Date("2026-09-02T21:00:00Z"), arrivalWindow: 120 })?.toISOString()).toBe("2026-09-02T16:00:00.000Z");
    expect(windowEnd({ scheduledStart: start, scheduledEnd: new Date("2026-09-02T15:00:00Z"), arrivalWindow: null })?.toISOString()).toBe("2026-09-02T15:00:00.000Z");
  });
});

describe("getVisitHistory (db)", () => {
  it("lists completed visits at 3284 Harborlight Hollow newest first with one-line summaries", async () => {
    const r = await getVisitHistory({ addressId: HARBORLIGHT });
    expect(r.address_label).toBe("3284 Harborlight Hollow Ln, Miami Beach");
    expect(r.visits.map((v) => v.invoice_number)).toEqual(["4925", "3989", "3599"]);
    const last = r.visits[0];
    expect(last.tech_names).toEqual(["Yvonne Aguilar"]);
    expect(last.one_line).toBe("Unit had a clogged drain line and a bad float switch I replaced switch owner approved and cleared drain");
    expect(r.visits[1].tags).toContain("Service Callback");
    for (const v of r.visits) {
      expect(v.one_line.length).toBeLessThanOrEqual(140);
      expect(v.one_line).not.toMatch(/\n/);
    }
  });
  it("pages with before and respects limit", async () => {
    const r = await getVisitHistory({ addressId: HARBORLIGHT, limit: 1, before: "2026-07-01T00:00:00Z" });
    expect(r.visits.map((v) => v.invoice_number)).toEqual(["3989"]);
  });
  it("returns nothing for an unknown address", async () => {
    const r = await getVisitHistory({ addressId: "adr_nope" });
    expect(r.visits).toEqual([]);
    expect(r.address_label).toBeNull();
  });
});

describe("getJob / getJobNotes (db)", () => {
  it("finds a job by invoice number with techs, window label and last note", async () => {
    const j = await getJob({ invoiceNumber: "4925" }, NOW);
    expect(j?.job_id).toBe(JOB_4925);
    expect(j?.address_label).toBe("3284 Harborlight Hollow Ln, Miami Beach");
    expect(j?.tech.map((t) => t.name)).toEqual(["Yvonne Aguilar"]);
    expect(j?.window_label).toBe("Monday July 27th, 5:30 PM to 7:30 PM");
    expect(j?.notes_count).toBe(3);
    expect(j?.last_note_one_line).toMatch(/^Unit had a clogged drain line/);
    expect(j?.customer.display_name).toBe("Sylvia Blackwell");
  });
  it("returns null for unknown ids", async () => {
    expect(await getJob({ jobId: "job_nope" })).toBeNull();
    expect(await getJob({ invoiceNumber: "0000" })).toBeNull();
    expect(await getJobNotes("job_nope")).toBeNull();
  });
  it("returns redacted notes in order", async () => {
    const n = await getJobNotes(JOB_4925);
    expect(n?.notes.map((x) => x.seq)).toEqual([0, 1, 2]);
    expect(n?.notes[0].author_type).toBe("office");
    for (const x of n!.notes) expect(x.content_redacted).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  });
});

describe("getOpenBalance (db)", () => {
  it("sums jobs.outstanding_balance per customer", async () => {
    const b = await getOpenBalance(THEO_LEVINE);
    expect(b?.customer_name).toBe("Theo Levine");
    expect(b?.total_cents).toBe(20893);
    expect(b?.invoices).toHaveLength(1);
    expect(b?.invoices[0].invoice_number).toBe("5394");
    expect(b?.invoices[0].address_label).toBe("115 Moonraker Dr, Miami Beach");
  });
  it("reports zero cleanly and null for unknown customers", async () => {
    const b = await getOpenBalance(SYLVIA);
    expect(b?.total_cents).toBe(0);
    expect(b?.invoices).toEqual([]);
    expect(await getOpenBalance("cus_nope")).toBeNull();
  });
});
