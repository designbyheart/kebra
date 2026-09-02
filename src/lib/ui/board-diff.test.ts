import { describe, expect, it } from "vitest";
import { diffBoards } from "./board-diff";
import type { BoardData } from "./board-types";

function board(jobs: { id: string; status?: string; tech?: string }[], needs: { id: string; status?: string }[] = []): BoardData {
  return {
    date: "2026-09-02",
    schedule: {
      jobs: jobs.map((j) => ({
        job_id: j.id,
        status: j.status ?? "scheduled",
        window_start: "2026-09-02T14:00:00Z",
        window_end: "2026-09-02T16:00:00Z",
        tech_ids: j.tech ? [j.tech] : [],
        priority: "normal",
        description: null,
      })),
    },
    canceled: [],
    needsScheduling: { jobs: needs.map((n) => ({ job_id: n.id, status: n.status ?? "needs scheduling", tech_ids: [], priority: "normal" })), total: needs.length },
    techs: [],
    now: "2026-09-02T14:00:00Z",
  } as unknown as BoardData;
}

describe("diffBoards", () => {
  it("flags new and changed cards and ignores untouched ones", () => {
    const prev = board([{ id: "a" }, { id: "b" }], [{ id: "n" }]);
    const next = board([{ id: "a" }, { id: "b", status: "in progress" }, { id: "c" }], [{ id: "n" }, { id: "m" }]);
    expect(diffBoards(prev, next)).toEqual({ b: "changed", c: "new", m: "new" });
  });

  it("treats a tech change as a change", () => {
    expect(diffBoards(board([{ id: "a", tech: "t1" }]), board([{ id: "a", tech: "t2" }]))).toEqual({ a: "changed" });
  });
});
