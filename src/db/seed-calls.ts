import "dotenv/config";
import { addDays, addHours, addMinutes, addSeconds, setHours, setMinutes, setSeconds, startOfDay } from "date-fns";
import { eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql as pg } from "./index";
import {
  calls,
  events,
  jobAssignments,
  jobs,
  notes,
  tasks,
  type Promise_,
  type ToolCallRecord,
  type TranscriptTurn,
} from "./schema";
import { fromET, nowET } from "../lib/time";

/**
 * pnpm db:seed-calls            — (re)insert three fixture calls (W2-C)
 * pnpm db:seed-calls --clean    — remove them
 * pnpm db:seed-calls --live [s] — add an in-progress call and append one
 *                                 transcript turn every 2 s for `s` seconds
 *                                 (default 30), then end it. Used to verify
 *                                 the detail page grows within 2 s.
 *
 * Idempotent: fixture rows have fixed ids and are deleted before insert.
 * Events are inserted directly (not via emitEvent) so their `ts` matches the
 * moment inside the call; every fixture event carries `payload.fixture = true`.
 *
 * Real rows referenced (from the import): Eugene Maddox at 3279 Harborlight
 * Hollow Ln (Miami Beach; W1 tests pin 3284 next door, so we stay off it), Stuart Fraser at 50 Sargassum Glen Ct (Coral Gables,
 * system install completed 2026-08-31, invoice 5469), Starfish Hospitality at
 * 10254 E Old Mangrove Rd, High Pointe Unit 36W (Pinecrest).
 */

const IDS = {
  booking: "call_fixture_w2c_booking01",
  warranty: "call_fixture_w2c_warranty1",
  handoff: "call_fixture_w2c_handoff01",
  live: "call_fixture_w2c_live0001",
  job: "job_fixture_w2c_booking01",
  note: "nte_fixture_w2c_booking01",
  taskWarranty: "tsk_fixture_w2c_warranty1",
  taskHandoff: "tsk_fixture_w2c_handoff01",
} as const;

const REAL = {
  eugene: { customerId: "cus_8c74626c152946e8bfb89f06a3a33981", addressId: "adr_07d0361bdad34e6ea8f61e550b0dc4cd", label: "3279 Harborlight Hollow Ln, Miami Beach" },
  stuart: { customerId: "cus_e0d0f1eaa5c3472792a7125eaeab2676", addressId: "adr_4c6780a40c934a6bb72ca6ceab00049d", label: "50 Sargassum Glen Ct, Coral Gables" },
  starfish: { customerId: "cus_3fa02a2e5e944cb1952b019a40d3afc5", addressId: "adr_b28b33a517b34df8bfcbab3b584e6d34", label: "10254 E Old Mangrove Rd, High Pointe Unit 36W, Pinecrest" },
  tanya: { id: "pro_9ff5524f64df4ed9be40f5ef8b7b9c5f", name: "Tanya Sawyer" },
  felix: { id: "pro_80c0a49656f34f89850602d4604b7e51", name: "Felix Fitzgerald" },
};

const ALL_CALL_IDS = [IDS.booking, IDS.warranty, IDS.handoff, IDS.live];

type FixtureEvent = {
  t: number;
  actor: "agent" | "office" | "system";
  type: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
};

const at = (start: Date, t: number) => addSeconds(start, t);
const A = (t: number, text: string): TranscriptTurn => ({ role: "assistant", text, t });
const U = (t: number, text: string): TranscriptTurn => ({ role: "user", text, t });
const S = (t: number, text: string): TranscriptTurn => ({ role: "system", text, t });
const agentPayload = (summary: string, extra: Record<string, unknown> = {}) => ({ actor_label: "Agent", summary, fixture: true, ...extra });

/** Next weekday at 10:00 ET (skips Sat/Sun). */
function nextVisitWindow(): { start: Date; end: Date; label: string } {
  let day = addDays(startOfDay(nowET()), 1);
  while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1);
  const startET = setSeconds(setMinutes(setHours(day, 10), 0), 0);
  const start = fromET(startET);
  const end = addHours(start, 2);
  const label = `${startET.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, 10 AM to noon`;
  return { start, end, label };
}

/** 1 s of 8 kHz 8-bit mono silence as a data URI, so the recording player renders offline. */
function silentWavDataUri(): string {
  const sampleRate = 8000;
  const samples = sampleRate;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  const body = Buffer.alloc(samples, 128);
  return `data:audio/wav;base64,${Buffer.concat([header, body]).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function bookingFixture(now: Date) {
  const start = addMinutes(now, -170);
  const win = nextVisitWindow();
  const invoice = "FX-5601"; // non-numeric on purpose: nextInvoiceNumber() only counts ^[0-9]+$
  const transcript: TranscriptTurn[] = [
    A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
    U(4, "Hi, yeah, my upstairs unit is frozen solid, there's ice all over the copper line. I'm at 3279 Harborlight Hollow."),
    A(12, "Sorry to hear that. Let me pull that address up, one second."),
    A(15, "3279 Harborlight Hollow Lane in Miami Beach, is this Eugene?"),
    U(18, "Yes, that's me."),
    A(19, "Great. Give me a moment to check your history."),
    A(23, "I see Tanya was out on June 24th for a service call, and there was a visit in March with a one-year labor warranty. A frozen coil usually points to a leak or an airflow problem, so I'd want a tech to take a proper look. Let me check the warranty and openings."),
    A(36, "I don't see anything open for the rest of today, but I can get Tanya back out tomorrow between 10 and noon, or Felix between 2 and 4. In the meantime, turn the system off at the thermostat and leave the fan on so the ice can thaw."),
    U(46, "Tomorrow at 10 with Tanya works. Is this going to be covered? You guys were just here."),
    A(51, "Labor is covered: your March 9th visit carries a one-year labor warranty, good through March 9th of next year. Parts I can't confirm from here, so I'll flag that for the office to check before Tanya arrives. Booking you now."),
    A(61, `You're set: ${win.label}, with Tanya. Is there a gate code or anything she should know to get in?`),
    U(68, "No gate, just ring the bell. Side yard is open."),
    A(71, "Noted. Anything else I can help with?"),
    U(73, "No, that's it, thank you."),
    A(75, "Thanks Eugene, we'll see you tomorrow. Bye now."),
  ];
  const toolCalls: ToolCallRecord[] = [
    {
      id: "tc_fx_b1",
      name: "find_address",
      args: { query: "3279 Harborlight Hollow" },
      result: { candidates: [{ address_id: REAL.eugene.addressId, customer_id: REAL.eugene.customerId, customer_name: "Eugene Maddox", label: REAL.eugene.label, confidence: 0.97 }] },
      ok: true,
      t: 13,
      durationMs: 210,
    },
    {
      id: "tc_fx_b2",
      name: "get_address_dossier",
      args: { address_id: REAL.eugene.addressId },
      result: { address_label: "3279 Harborlight Hollow Ln", last_visit: { date: "2026-06-24", tech_names: ["Tanya Sawyer"], summary: "Service call, standard service & repair fee (invoice 4428)" }, visit_count_12m: 2 },
      ok: true,
      t: 20,
      durationMs: 142,
    },
    { id: "tc_fx_b3", name: "check_warranty", args: { address_id: REAL.eugene.addressId }, result: { status: "partially_covered", labor: { covered: true, until: "2027-03-09", basis: "Tag '1 Yr Labor Warranty' on job 3580 (2026-03-09)" }, parts: { covered: "unknown", registered: "unknown", basis: "No install on file" }, needs_office_confirmation: true }, ok: true, t: 31, durationMs: 88 },
    {
      id: "tc_fx_b4",
      name: "find_availability",
      args: { from: win.start.toISOString().slice(0, 10), service_type: "diagnostic", priority: "high", preferred_employee_id: REAL.tanya.id, address_id: REAL.eugene.addressId },
      result: {
        slots: [
          { window_start: win.start.toISOString(), window_end: win.end.toISOString(), window_label: win.label, employee_id: REAL.tanya.id, employee_name: REAL.tanya.name, reason: "last_tech_here" },
          { window_start: addHours(win.start, 4).toISOString(), window_end: addHours(win.end, 4).toISOString(), window_label: win.label.replace("10 AM to noon", "2 to 4 PM"), employee_id: REAL.felix.id, employee_name: REAL.felix.name, reason: "least_loaded" },
        ],
      },
      ok: true,
      t: 32,
      durationMs: 260,
    },
    {
      id: "tc_fx_b5",
      name: "book_job",
      args: { customer_id: REAL.eugene.customerId, address_id: REAL.eugene.addressId, service_type: "diagnostic", window_start: win.start.toISOString(), employee_id: REAL.tanya.id, priority: "high", issue_summary: "Upstairs unit frozen, ice on the suction line; prior service call 2026-06-24" },
      result: { job_id: IDS.job, invoice_number: invoice, window_start: win.start.toISOString(), window_end: win.end.toISOString(), window_label: win.label, employee_name: REAL.tanya.name },
      ok: true,
      t: 58,
      durationMs: 340,
    },
  ];
  const promises: Promise_[] = [
    { text: `Tanya Sawyer arrives ${win.label}`, kind: "booking" },
    { text: "Office will confirm parts coverage before the visit (labor covered through 2027-03-09)", kind: "review" },
  ];
  const fixtureEvents: FixtureEvent[] = [
    { t: 0, actor: "agent", type: "call.started", entityType: "call", entityId: IDS.booking, payload: agentPayload("Inbound call from +1 (305) •••-0142", { call_id: IDS.booking, direction: "inbound", caller_number_masked: "+1 (305) •••-0142", via: "phone" }) },
    { t: 15, actor: "agent", type: "call.identified", entityType: "call", entityId: IDS.booking, payload: agentPayload("Matched Eugene Maddox at 3279 Harborlight Hollow Ln", { call_id: IDS.booking, customer_id: REAL.eugene.customerId, address_id: REAL.eugene.addressId, method: "address" }) },
    {
      t: 58,
      actor: "agent",
      type: "job.booked",
      entityType: "job",
      entityId: IDS.job,
      payload: agentPayload(`Booked a diagnostic for Eugene Maddox at ${REAL.eugene.label}, ${win.label}, with ${REAL.tanya.name}.`, {
        job_id: IDS.job,
        invoice_number: invoice,
        window_start: win.start.toISOString(),
        window_end: win.end.toISOString(),
        employee_id: REAL.tanya.id,
        employee_name: REAL.tanya.name,
        service_type: "diagnostic",
        priority: "high",
        customer_id: REAL.eugene.customerId,
        address_id: REAL.eugene.addressId,
        address_label: REAL.eugene.label,
      }),
    },
    { t: 58, actor: "agent", type: "note.added", entityType: "note", entityId: IDS.note, payload: agentPayload("Added the booking note: upstairs unit frozen, ice on the suction line", { note_id: IDS.note, job_id: IDS.job, address_id: REAL.eugene.addressId, preview: "Booked by the agent. Issue: upstairs unit frozen, ice on the suction line. Prior service call 2026-06-24 (Tanya); March 2026 job tagged 1 Yr Labor Warranty. Access: no gate, ring the bell, side yard open." }) },
    { t: 80, actor: "agent", type: "call.ended", entityType: "call", entityId: IDS.booking, payload: agentPayload("Call ended after 1:20 (caller hung up)", { call_id: IDS.booking, duration_s: 80, ended_reason: "customer-ended-call", outcome: "booked" }) },
    { t: 95, actor: "system", type: "call.analyzed", entityType: "call", entityId: IDS.booking, payload: { actor_label: "Analyzer", summary: "Analyzed: booked, 2 promises, needs review", call_id: IDS.booking, outcome: "booked", promises_count: 2, needs_review: true, fixture: true } },
  ];
  return {
    call: {
      id: IDS.booking,
      providerCallId: "fixture-booking-0001",
      direction: "inbound" as const,
      startedAt: start,
      endedAt: at(start, 80),
      callerNumber: "+13055550142",
      matchedCustomerId: REAL.eugene.customerId,
      matchedAddressId: REAL.eugene.addressId,
      status: "ended" as const,
      transcript,
      toolCalls,
      summary: `Eugene Maddox called about a frozen upstairs unit at 3279 Harborlight Hollow Ln. Agent recalled the June 24 service call, advised switching the system off with the fan on, and booked a high-priority diagnostic with Tanya Sawyer for ${win.label}. Caller asked whether the visit is covered: labor is covered by the March 9 one-year labor warranty; parts coverage could not be confirmed and was flagged for the office.`,
      outcome: "booked",
      promises,
      handoffReason: null,
      recordingUrl: silentWavDataUri(),
      needsReview: true,
      endedReason: "customer-ended-call",
      costCents: 9,
      raw: { fixture: true },
    },
    events: fixtureEvents,
    job: { win, invoice },
  };
}

function warrantyFixture(now: Date) {
  const start = addMinutes(now, -95);
  const transcript: TranscriptTurn[] = [
    A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
    U(4, "Hi, you installed a new system at my house last week and now there's a rattling noise from the outdoor unit. Is that covered, or am I paying for another visit?"),
    A(13, "Let me look. What's the service address?"),
    U(16, "50 Sargassum Glen Court, Coral Gables."),
    A(20, "50 Sargassum Glen Court, is this Stuart Fraser?"),
    U(22, "That's right."),
    A(25, "Good news: the installation was completed on August 31st, so labor is covered for a year, through August of next year, and the parts are under the manufacturer's warranty. A visit for that rattle wouldn't cost you anything. Want me to get someone out?"),
    U(36, "Let me check with my wife on timing and call back. Can you note it on the account so I don't have to explain it again?"),
    A(44, "Done. I've left a note so whoever picks up knows this is a warranty callback on the new install. Anything else?"),
    U(49, "No, that's all, thanks."),
    A(51, "Thanks Stuart, talk soon."),
  ];
  const toolCalls: ToolCallRecord[] = [
    { id: "tc_fx_w1", name: "find_address", args: { query: "50 Sargassum Glen Court", city: "Coral Gables" }, result: { candidates: [{ address_id: REAL.stuart.addressId, customer_id: REAL.stuart.customerId, customer_name: "Stuart Fraser", label: REAL.stuart.label, confidence: 0.99 }] }, ok: true, t: 18, durationMs: 190 },
    {
      id: "tc_fx_w2",
      name: "check_warranty",
      args: { address_id: REAL.stuart.addressId, equipment_hint: "outdoor unit rattling" },
      result: { status: "covered", labor: { covered: true, until: "2027-08-31", basis: "System installation completed 2026-08-31 (invoice 5469)" }, parts: { covered: "likely", registered: "unknown", basis: "Install within 5 years" }, needs_office_confirmation: false },
      ok: true,
      t: 23,
      durationMs: 105,
    },
    { id: "tc_fx_w3", name: "create_task", args: { kind: "followup", title: "Stuart Fraser will call back to schedule a warranty callback (rattle at outdoor unit)", customer_id: REAL.stuart.customerId }, result: { task_id: IDS.taskWarranty, kind: "followup" }, ok: true, t: 42, durationMs: 120 },
  ];
  const fixtureEvents: FixtureEvent[] = [
    { t: 0, actor: "agent", type: "call.started", entityType: "call", entityId: IDS.warranty, payload: agentPayload("Inbound call from +1 (786) •••-0198", { call_id: IDS.warranty, direction: "inbound", caller_number_masked: "+1 (786) •••-0198", via: "phone" }) },
    { t: 20, actor: "agent", type: "call.identified", entityType: "call", entityId: IDS.warranty, payload: agentPayload("Matched Stuart Fraser at 50 Sargassum Glen Ct", { call_id: IDS.warranty, customer_id: REAL.stuart.customerId, address_id: REAL.stuart.addressId, method: "address" }) },
    { t: 42, actor: "agent", type: "task.created", entityType: "task", entityId: IDS.taskWarranty, payload: agentPayload("Created a followup task for Stuart Fraser: will call back to schedule a warranty callback (rattle at outdoor unit)", { task_id: IDS.taskWarranty, kind: "followup", title: "Stuart Fraser will call back to schedule a warranty callback (rattle at outdoor unit)", customer_id: REAL.stuart.customerId, job_id: null, due_at: null }) },
    { t: 54, actor: "agent", type: "call.ended", entityType: "call", entityId: IDS.warranty, payload: agentPayload("Call ended after 0:54 (caller hung up)", { call_id: IDS.warranty, duration_s: 54, ended_reason: "customer-ended-call", outcome: "info" }) },
  ];
  return {
    call: {
      id: IDS.warranty,
      providerCallId: "fixture-warranty-0001",
      direction: "inbound" as const,
      startedAt: start,
      endedAt: at(start, 54),
      callerNumber: "+17865550198",
      matchedCustomerId: REAL.stuart.customerId,
      matchedAddressId: REAL.stuart.addressId,
      status: "ended" as const,
      transcript,
      toolCalls,
      summary: null, // analysis (W3-A) not run yet: detail page shows "Analysis pending"
      outcome: "info",
      promises: [] as Promise_[],
      handoffReason: null,
      recordingUrl: null,
      needsReview: false,
      endedReason: "customer-ended-call",
      costCents: 6,
      raw: { fixture: true },
    },
    events: fixtureEvents,
    task: { id: IDS.taskWarranty, kind: "followup" as const, title: "Stuart Fraser will call back to schedule a warranty callback (rattle at outdoor unit)", body: "New system installed 2026-08-31 (invoice 5469). Labor covered through 2027-08-31; parts likely covered. Caller checking timing with his wife and will call back.", customerId: REAL.stuart.customerId, dueAt: null as Date | null, createdAt: at(start, 42) },
  };
}

function handoffFixture(now: Date) {
  const start = addMinutes(now, -38);
  const dueAt = addHours(at(start, 60), 1);
  const transcript: TranscriptTurn[] = [
    A(0, "Gulf Breeze Air, this is the front desk. How can I help you today?"),
    U(4, "This is Marcy with Starfish Hospitality. I've got an invoice for unit 36W at 10254 East Old Mangrove that's charging us for a capacitor we already paid for in June. I need this fixed today."),
    A(14, "I'm sorry about that, Marcy. Let me find the unit."),
    A(17, "High Pointe unit 36W at 10254 East Old Mangrove Road, Starfish Hospitality. Billing questions need a person in the office, so let me transfer you now. One moment."),
    S(24, "Transferring to the office line…"),
    S(55, "Transfer failed: no answer after 30 s"),
    A(56, "I'm sorry, nobody in the office could pick up right now. I've logged this as a priority handoff with the invoice details, and someone will call you back within the hour. Is this the best number to reach you?"),
    U(66, "Yes, this number. Within the hour, please, I've got guests checking in at four."),
    A(70, "Understood, within the hour. I've marked it urgent. Anything else?"),
    U(74, "No. Thanks."),
    A(75, "Thank you, Marcy. Bye."),
  ];
  const toolCalls: ToolCallRecord[] = [
    { id: "tc_fx_h1", name: "find_address", args: { query: "10254 East Old Mangrove", unit: "36W" }, result: { candidates: [{ address_id: REAL.starfish.addressId, customer_id: REAL.starfish.customerId, customer_name: "Starfish Hospitality", label: REAL.starfish.label, confidence: 0.94 }] }, ok: true, t: 15, durationMs: 230 },
    { id: "tc_fx_h2", name: "transfer_call", args: { to_masked: "+1 (305) •••-0100", reason: "billing dispute" }, result: { status: "no-answer" }, ok: false, t: 24, durationMs: 30400 },
    {
      id: "tc_fx_h3",
      name: "create_task",
      args: { kind: "handoff", title: "Billing dispute: Starfish Hospitality, High Pointe 36W — duplicate capacitor charge", customer_id: REAL.starfish.customerId, due_at: dueAt.toISOString() },
      result: { task_id: IDS.taskHandoff, kind: "handoff" },
      ok: true,
      t: 60,
      durationMs: 130,
    },
  ];
  const promises: Promise_[] = [{ text: "Office will call back within the hour about the duplicate capacitor charge on unit 36W", kind: "callback", dueAt: dueAt.toISOString(), taskId: IDS.taskHandoff }];
  const fixtureEvents: FixtureEvent[] = [
    { t: 0, actor: "agent", type: "call.started", entityType: "call", entityId: IDS.handoff, payload: agentPayload("Inbound call from +1 (305) •••-0177", { call_id: IDS.handoff, direction: "inbound", caller_number_masked: "+1 (305) •••-0177", via: "phone" }) },
    { t: 17, actor: "agent", type: "call.identified", entityType: "call", entityId: IDS.handoff, payload: agentPayload("Matched Starfish Hospitality at 10254 E Old Mangrove Rd, High Pointe Unit 36W", { call_id: IDS.handoff, customer_id: REAL.starfish.customerId, address_id: REAL.starfish.addressId, method: "address" }) },
    { t: 24, actor: "agent", type: "call.transfer_attempted", entityType: "call", entityId: IDS.handoff, payload: agentPayload("Tried to transfer to the office: billing dispute", { call_id: IDS.handoff, to_masked: "+1 (305) •••-0100", reason: "billing dispute" }) },
    { t: 55, actor: "agent", type: "call.transfer_failed", entityType: "call", entityId: IDS.handoff, payload: agentPayload("Transfer failed: no answer", { call_id: IDS.handoff, reason: "no-answer" }) },
    { t: 60, actor: "agent", type: "task.created", entityType: "task", entityId: IDS.taskHandoff, payload: agentPayload("Created a handoff task for Starfish Hospitality: billing dispute, duplicate capacitor charge on unit 36W", { task_id: IDS.taskHandoff, kind: "handoff", title: "Billing dispute: Starfish Hospitality, High Pointe 36W — duplicate capacitor charge", customer_id: REAL.starfish.customerId, job_id: null, due_at: dueAt.toISOString() }) },
    { t: 78, actor: "agent", type: "call.ended", entityType: "call", entityId: IDS.handoff, payload: agentPayload("Call ended after 1:18 (agent ended the call)", { call_id: IDS.handoff, duration_s: 78, ended_reason: "assistant-ended-call", outcome: "handoff" }) },
    { t: 92, actor: "system", type: "call.analyzed", entityType: "call", entityId: IDS.handoff, payload: { actor_label: "Analyzer", summary: "Analyzed: handoff, 1 promise, needs review", call_id: IDS.handoff, outcome: "handoff", promises_count: 1, needs_review: true, fixture: true } },
  ];
  return {
    call: {
      id: IDS.handoff,
      providerCallId: "fixture-handoff-0001",
      direction: "inbound" as const,
      startedAt: start,
      endedAt: at(start, 78),
      callerNumber: "+13055550177",
      matchedCustomerId: REAL.starfish.customerId,
      matchedAddressId: REAL.starfish.addressId,
      status: "ended" as const,
      transcript,
      toolCalls,
      summary: "Marcy from Starfish Hospitality disputes a capacitor charge on the invoice for High Pointe unit 36W (10254 E Old Mangrove Rd), saying it was already paid in June. Agent attempted a transfer to the office; nobody answered after 30 s. Agent created an urgent handoff task and promised a callback within the hour; caller has guests checking in at 4 PM.",
      outcome: "handoff",
      promises,
      handoffReason: "Billing dispute; office did not answer the transfer",
      recordingUrl: null,
      needsReview: true,
      endedReason: "assistant-ended-call",
      costCents: 8,
      raw: { fixture: true },
    },
    events: fixtureEvents,
    task: { id: IDS.taskHandoff, kind: "handoff" as const, title: "Billing dispute: Starfish Hospitality, High Pointe 36W — duplicate capacitor charge", body: "Caller: Marcy, +1 (305) •••-0177. Says the capacitor on the latest invoice for unit 36W was already paid in June. Transfer to the office rang out. Promised a callback within the hour; guests check in at 4 PM.", customerId: REAL.starfish.customerId, dueAt, createdAt: at(start, 60) },
  };
}

// ---------------------------------------------------------------------------
// Live simulation
// ---------------------------------------------------------------------------

const LIVE_SCRIPT: Array<[TranscriptTurn["role"], string]> = [
  ["assistant", "Gulf Breeze Air, this is the front desk. How can I help you today?"],
  ["user", "Hi, this is Tom at 89 Harborlight Shores. The AC in the lobby is blowing warm."],
  ["assistant", "Sorry about that, Tom. Let me pull up 89 Harborlight Shores."],
  ["assistant", "89 Harborlight Shores Boulevard West, Windward Hospitality, is that right?"],
  ["user", "That's the one."],
  ["assistant", "I see Felix was there yesterday for a repair on the same system. Let me check who can get back out today."],
  ["assistant", "Felix has an opening between 2 and 4 this afternoon. Since he was just there, I'd send him back. Does that work?"],
  ["user", "Yes, please. And can you have him call the front desk when he's ten minutes out?"],
  ["assistant", "Absolutely, I'll put that in the booking note. One moment while I lock it in."],
  ["assistant", "You're set: today, 2 to 4, with Felix, and he'll call the front desk on his way. Anything else?"],
  ["user", "No, that's great, thank you."],
  ["assistant", "Thanks Tom. Talk soon."],
];

async function runLive(seconds: number) {
  const start = new Date();
  await db.delete(events).where(eq(events.callId, IDS.live));
  await db.delete(calls).where(eq(calls.id, IDS.live));
  await db.insert(calls).values({
    id: IDS.live,
    providerCallId: "fixture-live-0001",
    direction: "inbound",
    startedAt: start,
    callerNumber: "+19545550133",
    status: "in_progress",
    transcript: [],
    toolCalls: [],
    promises: [],
    raw: { fixture: true },
  });
  await db.insert(events).values({
    ts: start,
    actor: "agent",
    actorId: "vapi",
    callId: IDS.live,
    type: "call.started",
    entityType: "call",
    entityId: IDS.live,
    payload: agentPayload("Inbound call from +1 (954) •••-0133", { call_id: IDS.live, direction: "inbound", caller_number_masked: "+1 (954) •••-0133", via: "phone" }),
  });
  console.log(`[live] started ${IDS.live} at ${start.toISOString()}; open http://localhost:3000/calls/${IDS.live}`);

  const deadline = Date.now() + seconds * 1000;
  let i = 0;
  const transcript: TranscriptTurn[] = [];
  while (Date.now() < deadline && i < LIVE_SCRIPT.length) {
    await new Promise((r) => setTimeout(r, 2000));
    const [role, text] = LIVE_SCRIPT[i++];
    const t = Math.round((Date.now() - start.getTime()) / 1000);
    transcript.push({ role, text, t });
    await db.update(calls).set({ transcript }).where(eq(calls.id, IDS.live));
    console.log(`[live] ${new Date().toISOString()} appended turn ${i} (${role}) t=${t}s`);
  }
  const ended = new Date();
  await db
    .update(calls)
    .set({ status: "ended", endedAt: ended, endedReason: "customer-ended-call", outcome: "booked" })
    .where(eq(calls.id, IDS.live));
  await db.insert(events).values({
    ts: ended,
    actor: "agent",
    actorId: "vapi",
    callId: IDS.live,
    type: "call.ended",
    entityType: "call",
    entityId: IDS.live,
    payload: agentPayload("Call ended", { call_id: IDS.live, duration_s: Math.round((ended.getTime() - start.getTime()) / 1000), ended_reason: "customer-ended-call", outcome: "booked" }),
  });
  console.log(`[live] ended at ${ended.toISOString()}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function clean() {
  await db.delete(events).where(inArray(events.callId, ALL_CALL_IDS));
  await db.delete(events).where(inArray(events.entityId, [IDS.job, IDS.note, IDS.taskWarranty, IDS.taskHandoff]));
  await db.delete(tasks).where(inArray(tasks.id, [IDS.taskWarranty, IDS.taskHandoff]));
  await db.delete(jobs).where(eq(jobs.id, IDS.job)); // assignments + notes cascade
  await db.delete(calls).where(inArray(calls.id, ALL_CALL_IDS));
}

async function seed() {
  const now = new Date();
  const b = bookingFixture(now);
  const w = warrantyFixture(now);
  const h = handoffFixture(now);

  // Sanity: the real rows we reference must exist in this database.
  const [{ n }] = await db.execute<{ n: number }>(
    dsql`select count(*)::int as n from addresses where id in (${REAL.eugene.addressId}, ${REAL.stuart.addressId}, ${REAL.starfish.addressId})`,
  );
  if (Number(n) !== 3) {
    throw new Error(`expected the imported addresses to exist (found ${n}/3). Run pnpm import first.`);
  }

  await clean();

  await db.insert(calls).values([b.call, w.call, h.call]);

  await db.insert(jobs).values({
    id: IDS.job,
    invoiceNumber: b.job.invoice,
    description: "Diagnostic — upstairs unit frozen, ice on the suction line",
    workStatus: "scheduled",
    scheduledStart: b.job.win.start,
    scheduledEnd: b.job.win.end,
    arrivalWindow: 120,
    tags: ["Fixture"],
    customerId: REAL.eugene.customerId,
    addressId: REAL.eugene.addressId,
    source: "agent",
    priority: "high",
    serviceType: "diagnostic",
    createdAt: at(b.call.startedAt, 58),
    updatedAt: at(b.call.startedAt, 58),
  });
  await db.insert(jobAssignments).values({ jobId: IDS.job, employeeId: REAL.tanya.id });
  await db.insert(notes).values({
    id: IDS.note,
    jobId: IDS.job,
    content: "Booked by the agent. Issue: upstairs unit frozen, ice on the suction line. Prior service call 2026-06-24 (Tanya); March 2026 job tagged 1 Yr Labor Warranty. Caller: Eugene Maddox, +1 (305) •••-0142. Access: no gate, ring the bell, side yard open. Parts coverage flagged for the office.",
    authorType: "agent",
    authorId: "vapi",
    createdAt: at(b.call.startedAt, 58),
    seq: 0,
  });

  await db.insert(tasks).values([
    { id: w.task.id, kind: w.task.kind, status: "open", title: w.task.title, body: w.task.body, customerId: w.task.customerId, callId: IDS.warranty, dueAt: w.task.dueAt, createdAt: w.task.createdAt },
    { id: h.task.id, kind: h.task.kind, status: "open", title: h.task.title, body: h.task.body, customerId: h.task.customerId, callId: IDS.handoff, dueAt: h.task.dueAt, createdAt: h.task.createdAt },
  ]);

  const rows = [
    ...b.events.map((e) => ({ callId: IDS.booking, start: b.call.startedAt, e })),
    ...w.events.map((e) => ({ callId: IDS.warranty, start: w.call.startedAt, e })),
    ...h.events.map((e) => ({ callId: IDS.handoff, start: h.call.startedAt, e })),
  ]
    .map(({ callId, start, e }) => ({
      ts: at(start, e.t),
      actor: e.actor,
      actorId: e.actor === "agent" ? "vapi" : e.actor === "system" ? "seed-calls" : null,
      callId,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId,
      payload: e.payload,
    }))
    .sort((x, y) => x.ts.getTime() - y.ts.getTime());
  await db.insert(events).values(rows);

  console.log(`seeded 3 fixture calls, 1 job (${b.job.invoice}), 2 tasks, ${rows.length} events`);
  for (const id of [IDS.booking, IDS.warranty, IDS.handoff]) console.log(`  /calls/${id}`);
}

async function main() {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--clean")) {
      await clean();
      console.log("removed fixture calls");
    } else if (args.includes("--live")) {
      const idx = args.indexOf("--live");
      const secs = Number(args[idx + 1]) || 30;
      await runLive(secs);
    } else {
      await seed();
    }
  } finally {
    await pg.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
