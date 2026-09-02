import { describe, expect, it } from "vitest";
import {
  approversLine,
  cancellationReviewHref,
  cancellationsDescription,
  groupByKind,
  groupEmptyMessage,
  inboxEmptyMessage,
  inboxHref,
  INBOX_ZERO,
  isOverdue,
  parseKindFilter,
  parseStatusFilter,
  parseTaskFocus,
  resolutionLine,
  sortTasks,
  transitionsFor,
} from "./inbox-grouping";

const NOW = new Date("2026-09-02T16:00:00Z");
const d = (iso: string | null) => (iso ? new Date(iso) : null);

describe("inbox grouping", () => {
  it("groups in the fixed kind order with empty groups kept", () => {
    const groups = groupByKind([
      { kind: "callback" as const, id: 1 },
      { kind: "cancellation" as const, id: 2 },
      { kind: "callback" as const, id: 3 },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["cancellation", "handoff", "callback", "review", "followup"]);
    expect(groups[0].items.map((i) => i.id)).toEqual([2]);
    expect(groups[2].items.map((i) => i.id)).toEqual([1, 3]);
    expect(groups[1].items).toEqual([]);
  });

  it("narrows to one kind when asked", () => {
    expect(groupByKind([{ kind: "review" as const }], "review")).toEqual([{ kind: "review", items: [{ kind: "review" }] }]);
  });

  it("sorts overdue first, then earliest due, then newest created; undated last", () => {
    const items = [
      { id: "later", dueAt: d("2026-09-05T12:00:00Z"), createdAt: d("2026-09-01T00:00:00Z")! },
      { id: "undated-new", dueAt: null, createdAt: d("2026-09-02T15:00:00Z")! },
      { id: "overdue", dueAt: d("2026-09-01T12:00:00Z"), createdAt: d("2026-08-30T00:00:00Z")! },
      { id: "undated-old", dueAt: null, createdAt: d("2026-08-01T00:00:00Z")! },
      { id: "soon", dueAt: d("2026-09-02T18:00:00Z"), createdAt: d("2026-09-01T00:00:00Z")! },
    ];
    expect(sortTasks(items, NOW).map((i) => i.id)).toEqual(["overdue", "soon", "later", "undated-new", "undated-old"]);
  });

  it("only open / in-progress tasks can be overdue", () => {
    expect(isOverdue({ dueAt: d("2026-09-01T00:00:00Z"), status: "open" }, NOW)).toBe(true);
    expect(isOverdue({ dueAt: d("2026-09-01T00:00:00Z"), status: "done" }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: d("2026-09-09T00:00:00Z"), status: "open" }, NOW)).toBe(false);
    expect(isOverdue({ dueAt: null, status: "open" }, NOW)).toBe(false);
  });

  it("parses filters with safe defaults", () => {
    expect(parseStatusFilter(undefined)).toBe("open");
    expect(parseStatusFilter("bogus")).toBe("open");
    expect(parseStatusFilter(["done"])).toBe("done");
    expect(parseKindFilter("callback")).toBe("callback");
    expect(parseKindFilter("nope")).toBeNull();
  });

  it("offers the right transitions", () => {
    expect(transitionsFor("open").map((t) => t.to)).toEqual(["in_progress", "done", "dismissed"]);
    expect(transitionsFor("done").map((t) => t.to)).toEqual(["open"]);
    expect(transitionsFor("dismissed").map((t) => t.label)).toEqual(["Reopen"]);
  });

  it("builds filter links without default params", () => {
    expect(inboxHref("open", null)).toBe("/inbox");
    expect(inboxHref("done", null)).toBe("/inbox?status=done");
    expect(inboxHref("open", "callback")).toBe("/inbox?kind=callback");
    expect(inboxHref("all", "review")).toBe("/inbox?status=all&kind=review");
    expect(cancellationReviewHref(null)).toBe("/inbox?kind=cancellation");
    expect(cancellationReviewHref("t 1")).toBe("/inbox?kind=cancellation&task=t%201");
  });

  it("reads the task focus param", () => {
    expect(parseTaskFocus(undefined)).toBeNull();
    expect(parseTaskFocus("t1")).toBe("t1");
    expect(parseTaskFocus(["t2", "t3"])).toBe("t2");
  });

  it("writes the empty-state copy", () => {
    expect(inboxEmptyMessage("open", null)).toBe(INBOX_ZERO);
    expect(inboxEmptyMessage("open", "callback")).toBe("No open callbacks.");
    expect(inboxEmptyMessage("done", null)).toBe("Nothing done under tasks.");
    expect(inboxEmptyMessage("all", "review")).toBe("No reviews.");
    expect(groupEmptyMessage("in_progress", "handoff")).toBe("Nothing in progress under handoffs.");
  });

  it("picks the cancellations description and approver line", () => {
    expect(cancellationsDescription(true)).toMatch(/Approve to cancel/);
    expect(cancellationsDescription(false)).toMatch(/Only an admin/);
    expect(approversLine(["Ana", "Bo"])).toBe("Can approve: Ana, Bo");
    expect(approversLine([])).toBe("No admin users are set up yet.");
  });

  it("writes the resolution sentence", () => {
    expect(resolutionLine({ status: "approved", resolvedByName: null, resolvedAt: null, resolutionNote: null, previousStatus: "scheduled" })).toBe("Approved by office");
    const line = resolutionLine({ status: "rejected", resolvedByName: "Pat", resolvedAt: NOW, resolutionNote: "tech en route", previousStatus: "scheduled" });
    expect(line).toMatch(/^Rejected by Pat · .+ · “tech en route” · status restored to scheduled$/);
  });
});
