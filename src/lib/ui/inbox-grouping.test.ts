import { describe, expect, it } from "vitest";
import { groupByKind, isOverdue, parseKindFilter, parseStatusFilter, sortTasks, transitionsFor } from "./inbox-grouping";

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
});
