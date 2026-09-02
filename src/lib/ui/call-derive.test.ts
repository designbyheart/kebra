import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  callerLabel,
  deriveActions,
  describeToolCall,
  durationSeconds,
  formatDuration,
  hasHandoff,
  maskPhone,
  type EventLike,
} from "./derive";

describe("buildTimeline", () => {
  it("groups consecutive turns by the same speaker and keeps offsets", () => {
    const items = buildTimeline([
      { role: "assistant", text: "Gulf Breeze Air, this is the front desk.", t: 0 },
      { role: "assistant", text: "How can I help?", t: 2 },
      { role: "user", text: "My upstairs unit is frozen.", t: 5 },
      { role: "user", text: "3284 Harborlight Hollow.", t: 8 },
      { role: "assistant", text: "Let me pull that up.", t: 10 },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["group", "group", "group"]);
    const [a, u, b] = items;
    expect(a.kind === "group" && a.role).toBe("assistant");
    expect(a.kind === "group" && a.turns.map((x) => x.t)).toEqual([0, 2]);
    expect(u.kind === "group" && u.turns.length).toBe(2);
    expect(b.kind === "group" && b.turns[0].text).toBe("Let me pull that up.");
  });

  it("interleaves tool calls by time and breaks speaker groups around them", () => {
    const items = buildTimeline(
      [
        { role: "assistant", text: "One moment.", t: 10 },
        { role: "assistant", text: "Found it, Sylvia Blackwell in Miami Beach.", t: 13 },
      ],
      [{ name: "find_address", args: { query: "3284 Harborlight Hollow" }, ok: true, t: 11, durationMs: 210 }],
    );
    expect(items.map((i) => i.kind)).toEqual(["group", "tool", "group"]);
    const tool = items[1];
    expect(tool.kind === "tool" && tool.label).toBe("looked up 3284 Harborlight Hollow · 210 ms");
  });

  it("places a tool call after the turn that shares its timestamp", () => {
    const items = buildTimeline(
      [{ role: "user", text: "Am I under warranty?", t: 20 }],
      [{ name: "check_warranty", args: {}, result: { status: "covered" }, t: 20, durationMs: 95 }],
    );
    expect(items.map((i) => i.kind)).toEqual(["group", "tool"]);
    expect(items[1].kind === "tool" && items[1].label).toBe("checked warranty: covered · 95 ms");
  });

  it("renders system and tool-role turns as system lines", () => {
    const items = buildTimeline([
      { role: "system", text: "Transfer to office attempted", t: 30 },
      { role: "tool", text: "transfer failed: no answer", t: 45 },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["system", "system"]);
  });

  it("tolerates non-numeric offsets and an empty transcript", () => {
    expect(buildTimeline([])).toEqual([]);
    const items = buildTimeline([{ role: "user", text: "hi", t: "abc" as unknown as number }]);
    expect(items[0].t).toBe(0);
  });
});

describe("describeToolCall", () => {
  it("marks failures and omits the timing when unknown", () => {
    expect(describeToolCall({ name: "book_job", args: {}, ok: false, t: 1 })).toBe("booked job · failed");
    expect(describeToolCall({ name: "get_address_dossier", args: {}, result: { address_label: "3284 Harborlight Hollow Ln" }, t: 1, durationMs: 142.4 })).toBe(
      "pulled history for 3284 Harborlight Hollow Ln · 142 ms",
    );
    expect(describeToolCall({ name: "something_new", args: {}, t: 1 })).toBe("ran something_new");
  });
});

const ev = (partial: Partial<EventLike> & Pick<EventLike, "id" | "type">): EventLike => ({
  ts: new Date("2026-09-02T14:00:00Z"),
  actor: "agent",
  entityType: "job",
  entityId: null,
  payload: {},
  ...partial,
});

describe("deriveActions", () => {
  it("drops lifecycle events, keeps mutations in id order, and links entities", () => {
    const actions = deriveActions([
      ev({ id: 5, type: "task.created", entityType: "task", entityId: "tsk_1", payload: { summary: "Created a handoff task", task_id: "tsk_1", actor_label: "Agent" } }),
      ev({ id: 1, type: "call.started", entityType: "call", payload: { summary: "Call started" } }),
      ev({ id: 2, type: "call.identified", entityType: "call", payload: { summary: "Matched Sylvia Blackwell", customer_id: "cus_1" } }),
      ev({ id: 3, type: "job.booked", entityId: "job_9", payload: { summary: "Booked a diagnostic", job_id: "job_9", fixture: true } }),
      ev({ id: 4, type: "note.added", entityType: "note", entityId: "nte_1", payload: { summary: "Added a note", job_id: "job_9" } }),
      ev({ id: 6, type: "call.ended", entityType: "call", payload: { summary: "Call ended" } }),
      ev({ id: 7, type: "call.reviewed", entityType: "call", actor: "office", payload: { summary: "Marked reviewed" } }),
    ]);
    expect(actions.map((a) => a.id)).toEqual([2, 3, 4, 5]);
    expect(actions.map((a) => a.kind)).toEqual(["identified", "booking", "note", "task"]);
    expect(actions[0].href).toBe("/customers/cus_1");
    expect(actions[1].href).toBe("/jobs/job_9");
    expect(actions[1].fixture).toBe(true);
    expect(actions[2].href).toBe("/jobs/job_9");
    expect(actions[3].href).toBe("/inbox?task=tsk_1");
    expect(actions[3].actorLabel).toBe("Agent");
    expect(actions[3].agent).toBe(true);
  });

  it("classifies cancellations, reschedules and transfers", () => {
    const actions = deriveActions([
      ev({ id: 1, type: "job.rescheduled", payload: { summary: "Moved", job_id: "job_1" } }),
      ev({ id: 2, type: "job.cancellation_requested", payload: { summary: "Asked to cancel", job_id: "job_1" } }),
      ev({ id: 3, type: "call.transfer_attempted", entityType: "call", payload: { summary: "Tried the office" } }),
      ev({ id: 4, type: "call.transfer_failed", entityType: "call", payload: { summary: "No answer" } }),
      ev({ id: 5, type: "customer.phone_added", entityType: "customer", entityId: "cus_2", payload: { summary: "Saved phone" } }),
    ]);
    expect(actions.map((a) => a.kind)).toEqual(["reschedule", "cancellation", "transfer", "transfer", "phone"]);
    expect(actions[4].href).toBe("/customers/cus_2");
  });

  it("falls back to the event type and actor when the payload is bare", () => {
    const [a] = deriveActions([ev({ id: 1, type: "job.reassigned", actor: "office", payload: {} })]);
    expect(a.label).toBe("job.reassigned");
    expect(a.actorLabel).toBe("Office");
    expect(a.href).toBeNull();
  });
});

describe("hasHandoff", () => {
  it("detects handoffs from status, outcome, reason or transfer events", () => {
    expect(hasHandoff({ status: "ended", outcome: "info", handoffReason: null })).toBe(false);
    expect(hasHandoff({ status: "forwarding", outcome: null, handoffReason: null })).toBe(true);
    expect(hasHandoff({ status: "ended", outcome: "handoff", handoffReason: null })).toBe(true);
    expect(hasHandoff({ status: "ended", outcome: "info", handoffReason: "billing dispute" })).toBe(true);
    expect(hasHandoff({ status: "ended", outcome: "info", handoffReason: null, events: [{ type: "call.transfer_failed" }] })).toBe(true);
  });
});

describe("presentation helpers", () => {
  it("masks phone numbers and labels web calls", () => {
    expect(maskPhone("+13055550142")).toBe("+1 (305) •••-0142");
    expect(maskPhone("3055550142")).toBe("+1 (305) •••-0142");
    expect(maskPhone("+442071234567")).toBe("+••• 4567");
    expect(maskPhone(null)).toBeNull();
    expect(callerLabel({ direction: "web", callerNumber: null })).toBe("Web");
    expect(callerLabel({ direction: "inbound", callerNumber: null })).toBe("Unknown");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(252)).toBe("4:12");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("—");
    expect(durationSeconds("2026-09-02T14:00:00Z", "2026-09-02T14:04:12Z")).toBe(252);
    expect(durationSeconds("2026-09-02T14:00:00Z", null, new Date("2026-09-02T14:00:30Z"))).toBe(30);
  });
});
