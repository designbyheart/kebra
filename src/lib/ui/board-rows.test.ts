import { describe, expect, it } from "vitest";
import type { TechDay } from "@/domain/schedule";
import { buildRows } from "./board-rows";
import type { BoardJob } from "./board-types";

const job = (id: string, techs: string[], status = "scheduled"): BoardJob =>
  ({ job_id: id, status, tech_ids: techs, window_start: "2026-09-02T14:00:00Z", window_end: "2026-09-02T16:00:00Z", priority: "normal" }) as unknown as BoardJob;
const tech = (id: string, name: string, first: string | null = "2026-09-02T14:00:00Z"): TechDay =>
  ({ employee_id: id, name, job_count: 1, first_start: first, last_end: first }) as unknown as TechDay;

describe("buildRows", () => {
  it("orders techs by first start, then adds Unassigned and orphan Canceled rows", () => {
    const rows = buildRows(
      [job("j1", ["t2"]), job("j2", ["t1"]), job("j3", []), job("j4", ["gone"], "user canceled")],
      [tech("t1", "Ana", "2026-09-02T15:00:00Z"), tech("t2", "Ben", "2026-09-02T13:00:00Z")],
      [
        { id: "t1", name: "Ana" },
        { id: "t2", name: "Ben" },
      ],
    );
    expect(rows.map((r) => r.key)).toEqual(["t2", "t1", "__unassigned", "__canceled"]);
    expect(rows[0]!.subtitle).toBe("1 job · 9–9 AM");
    expect(rows[2]!.subtitle).toBe("1 to assign");
    expect(rows[3]).toMatchObject({ title: "Canceled", subtitle: "1 off the board", muted: true });
  });

  it("mutes an empty Unassigned row and keeps a working tech's canceled job in their row", () => {
    const rows = buildRows([job("j1", ["t1"], "pro canceled")], [tech("t1", "Ana")], [{ id: "t1", name: "Ana" }]);
    expect(rows[0]!.jobs.map((j) => j.job_id)).toEqual(["j1"]);
    expect(rows[1]).toMatchObject({ key: "__unassigned", subtitle: null, muted: true });
    expect(rows).toHaveLength(2);
  });
});
