import "dotenv/config";
import { describe, expect, it } from "vitest";
import { sql } from "@/db";
import { registry, type ToolContext } from "@/agent/registry";
import { ToolError } from "@/agent/errors";
import { tools } from "./knowledge";
import { describeWork, dossierSpeechHint, spokenWork } from "./get-address-dossier";
import { jobSpeech } from "./get-job";
import { visitHistorySpeech } from "./get-visit-history";
import { buildDossierFallback } from "@/domain/dossier-fallback";

const ctx: ToolContext = { callId: null, actor: "agent", actorId: "vapi" };
const NOW = new Date("2026-09-02T16:00:00Z");
const HARBORLIGHT = "adr_04dde9629abe496f99b95a5a9e94a3f0";
const GROUPER = "adr_4840691e98d443c2b4edcae6e86ced8a";

async function run<T = Record<string, unknown>>(name: string, input: unknown): Promise<T> {
  const def = registry[name];
  const parsed = def.input.safeParse(input);
  if (!parsed.success) throw new Error(`invalid input for ${name}: ${JSON.stringify(parsed.error.issues)}`);
  return (await def.handler(parsed.data, ctx)) as T;
}

async function fails(name: string, input: unknown): Promise<ToolError> {
  try {
    await run(name, input);
  } catch (e) {
    if (e instanceof ToolError) return e;
    throw e;
  }
  throw new Error(`${name} did not throw`);
}

describe("knowledge tool registration", () => {
  it("registers the seven knowledge tools with prompt-grade descriptions", () => {
    for (const name of ["get_address_dossier", "get_visit_history", "get_job_notes", "get_job", "check_warranty", "get_open_balance", "get_schedule"]) {
      expect(tools[name]).toBeDefined();
      expect(registry[name]).toBe(tools[name]);
      expect(registry[name].description.length).toBeGreaterThan(80);
    }
  });
  it("validates inputs", () => {
    expect(registry.get_visit_history.input.safeParse({}).success).toBe(false);
    expect(registry.get_job.input.safeParse({}).success).toBe(false);
    expect(registry.get_schedule.input.safeParse({ date: "Sept 2" }).success).toBe(false);
    expect(registry.get_schedule.input.safeParse({ date: "2026-09-02" }).success).toBe(true);
  });
});

describe("sentence builders", () => {
  it("turns price-book families into past-tense phrases", () => {
    expect(spokenWork("Clear Drain Line")).toBe("cleared the drain line");
    expect(spokenWork("Capacitor Replacement")).toBe("replaced the capacitor");
    expect(spokenWork("Replace safety switch")).toBe("replaced the safety switch");
    expect(spokenWork("Coil clean in place")).toBe("cleaned the coil in place");
    expect(spokenWork("Visit #4")).toBe("did the maintenance visit");
    expect(spokenWork("Widget Replacement")).toBe("replaced the widget");
    expect(spokenWork("Tier 7 Repair")).toBeNull();
    expect(describeWork({ work_items: ["Clear Drain Line", "Replace safety switch"], description: null, summary: "" })).toBe("cleared the drain line and replaced the safety switch");
    expect(describeWork({ work_items: [], description: "Tier 3 Repair - Capacitor Replacement", summary: "" })).toBe("replaced the capacitor");
    expect(describeWork({ work_items: [], description: "", summary: "" })).toBeNull();
  });

  it("speaks the Harborlight and Grouper dossiers", async () => {
    const h = await buildDossierFallback(HARBORLIGHT, NOW);
    expect(dossierSpeechHint(h!, NOW)).toBe(
      "We were last at 3284 Harborlight Hollow Lane on July 27th; Yvonne cleared the drain line and replaced the safety switch. There's a service callback tag from the May 11th visit.",
    );
    const g = await buildDossierFallback(GROUPER, NOW);
    expect(dossierSpeechHint(g!, NOW)).toBe(
      "We were last at 103 Grouper Landing Road, Casa de Egret on April 30th; Alina did the maintenance visit. Labor is under our warranty until March 2nd, 2027.",
    );
  });

  it("prefers an imminent visit, then a callback, then a balance as the flag", async () => {
    const seagrape = await buildDossierFallback("adr_2d7a0e636f9c4c57ae7ba869142f0355", NOW);
    expect(dossierSpeechHint(seagrape!, NOW)).toBe(
      "We were last at 205 Seagrape Hollow Street on September 1st; Alina and Esther replaced the compressor. The new system install is on the books tomorrow from 10 AM to noon with Selena and Tamara.",
    );
    const tidewater = await buildDossierFallback("adr_3ced064501d8450ea46a723cb476540e", NOW);
    expect(dossierSpeechHint(tidewater!, NOW)).toBe(
      "We were last at 1860 Tidewater Landing Drive on August 27th; Tanya replaced the control board. That visit is tagged as a warranty claim.",
    );
    const noCallback = { ...tidewater!, open_issue_details: [], open_issues: [] };
    expect(dossierSpeechHint(noCallback, NOW)).toMatch(/There's an open balance of \$815 from that visit\.$/);
    const banyan = await buildDossierFallback("adr_d90a4549de3541e3b36bb52a0ccb3ea2", NOW);
    expect(dossierSpeechHint(banyan!, NOW)).toBe("We were last at 4311 Banyan Ridge Boulevard, unit 106 on September 1st; Tobias was out but there are no notes on that visit.");
    const empty = { ...banyan!, last_visit: null, upcoming: [] };
    expect(dossierSpeechHint(empty, NOW)).toBe("We don't have a completed visit at 4311 Banyan Ridge Boulevard, unit 106 on file yet.");
  });

  it("never puts a code in speech", async () => {
    const g = await buildDossierFallback(GROUPER, NOW);
    expect(g!.access_notes).not.toBeNull();
    expect(dossierSpeechHint(g!, NOW)).not.toMatch(/code/i);
  });

  it("speaks visits and jobs", () => {
    expect(visitHistorySpeech([], "3284 Harborlight Hollow Lane")).toBe("I don't see any completed visits at 3284 Harborlight Hollow Lane on file.");
    expect(
      jobSpeech(
        {
          job_id: "job_x", invoice_number: "5466", description: "System Installation", work_status: "scheduled", priority: "normal",
          window_start: "2026-09-02T14:00:00.000Z", window_end: "2026-09-02T16:00:00.000Z", window_label: "", arrival_window_min: 120,
          tech: [{ employee_id: "a", name: "Tamara Porter" }, { employee_id: "b", name: "Selena Hayes" }],
          customer: { customer_id: "c", display_name: "Ariel Navarro", kind: "homeowner" }, address_id: "adr", address_label: "8592 Rudder Landing Ln, Aventura",
          total_cents: 0, outstanding_cents: 50000, tags: [], notes_count: 0, last_note_one_line: "", source: "import", visit_date: null,
        },
        NOW,
      ),
    ).toBe("Job 5466 at 8592 Rudder Landing Lane is scheduled for today, 10 AM to noon; Tamara and Selena are assigned; there's $500 still open on it.");
  });
});

describe("handlers end to end (db)", () => {
  it("get_address_dossier works with or without a precomputed row and hoists speech_hint", async () => {
    const r = await run<{ speech_hint: string; source: string; summary_md: string | null; access_notes: { sensitive: boolean } | null; warranty: { status: string } }>(
      "get_address_dossier",
      { address_id: HARBORLIGHT },
    );
    expect(r.speech_hint).toMatch(/^We were last at 3284 Harborlight Hollow Lane on July 27th; Yvonne cleared the drain line and replaced the safety switch\./);
    expect(r.warranty.status).toBe("unknown");
    expect(["fallback", "precomputed+fallback"]).toContain(r.source);
    if (r.source === "precomputed+fallback") expect(typeof r.summary_md).toBe("string");
    else expect(r.summary_md).toBeNull();

    // If W1-D has landed any dossier rows, the merge must surface summary_md for one of them.
    const rows = await sql<{ address_id: string }[]>`select address_id from address_dossiers where summary_md is not null limit 1`;
    if (rows.length) {
      const m = await run<{ source: string; summary_md: string | null; speech_hint: string }>("get_address_dossier", { address_id: rows[0].address_id });
      expect(m.source).toBe("precomputed+fallback");
      expect(m.summary_md!.length).toBeGreaterThan(10);
      expect(m.speech_hint.length).toBeGreaterThan(20);
    }
  });

  it("errors are coded and speakable", async () => {
    expect((await fails("get_address_dossier", { address_id: "adr_nope" })).code).toBe("not_found");
    expect((await fails("check_warranty", { address_id: "adr_nope" })).code).toBe("not_found");
    expect((await fails("get_job", { invoice_number: "0000" })).speechHint).toMatch(/double-check/);
    expect((await fails("get_job_notes", { job_id: "job_nope" })).code).toBe("not_found");
    expect((await fails("get_open_balance", { customer_id: "cus_nope" })).code).toBe("not_found");
    expect((await fails("get_visit_history", { address_id: "adr_nope" })).code).toBe("not_found");
    expect((await fails("get_schedule", { date: "2026-02-30" })).code).toBe("validation");
  });

  it("get_visit_history, get_job, get_job_notes, check_warranty, get_open_balance, get_schedule return speech", async () => {
    const vh = await run<{ visits: unknown[]; speech_hint: string }>("get_visit_history", { address_id: HARBORLIGHT, limit: 3 });
    expect(vh.visits).toHaveLength(3);
    expect(vh.speech_hint).toMatch(/^I see three visits at 3284 Harborlight Hollow Lane; the most recent was July 27th, when Yvonne noted/);

    const job = await run<{ job_id: string; speech_hint: string }>("get_job", { invoice_number: "4925" });
    expect(job.job_id).toBe("job_15a0d32e03cb4cb597f39ba187b934d8");
    expect(job.speech_hint).toBe("Job 4925 at 3284 Harborlight Hollow Lane is complete on July 27th; Yvonne was on it.");

    const notes = await run<{ notes: { content_redacted: string }[]; speech_hint: string }>("get_job_notes", { job_id: job.job_id });
    expect(notes.notes).toHaveLength(3);
    expect(notes.speech_hint).toBe("Job 4925 has three notes; the tech wrote: Unit had a clogged drain line and a bad float switch I replaced switch owner approved and cleared drain");

    const w = await run<{ status: string; speech_hint: string; equipment: unknown[] }>("check_warranty", { address_id: GROUPER, equipment_hint: "the 2.5 ton upstairs" });
    expect(w.status).toBe("covered");
    expect(w.equipment).toHaveLength(4);
    expect(w.speech_hint).toMatch(/^Labor is covered until March 2nd, 2027/);

    const b = await run<{ total_cents: number; speech_hint: string }>("get_open_balance", { customer_id: "cus_1abe4bb4a17843f8983cf33f1acd318e" });
    expect(b.total_cents).toBe(20893);
    expect(b.speech_hint).toBe("Theo Levine has an open balance of $208.93 on job 5394 going back to September 1st.");

    const s = await run<{ summary: { total: number }; speech_hint: string }>("get_schedule", { date: "2026-09-02" });
    expect(s.summary.total).toBe(10);
    expect(s.speech_hint).toMatch(/^Ten jobs (today|on Wednesday September 2nd) across nine techs, one install\.$/);
  });
});
