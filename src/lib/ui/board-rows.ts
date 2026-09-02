/**
 * Row model for the board timeline: one row per tech, then Unassigned, then
 * an optional Canceled row. Pure; unit-tested in ./board-rows.test.ts.
 */
import type { TechDay } from "@/domain/schedule";
import { shortRange } from "./board-layout";
import { isCanceledStatus } from "./board-status";
import type { BoardJob, BoardTech } from "./board-types";

export type Row = { key: string; title: string; subtitle: string | null; jobs: BoardJob[]; muted?: boolean };

/**
 * One row per tech working the day (from getSchedule, earliest start first),
 * then "Unassigned", then a muted "Canceled" row for canceled jobs whose tech
 * has no live work that day. Canceled jobs of a working tech stay in their row.
 */
export function buildRows(jobs: BoardJob[], techs: TechDay[], allTechs: BoardTech[]): Row[] {
  const working = new Set(techs.map((t) => t.employee_id));
  const byTech = new Map<string, BoardJob[]>();
  const unassigned: BoardJob[] = [];
  const orphanCanceled: BoardJob[] = [];
  for (const j of jobs) {
    if (j.tech_ids.length === 0) {
      unassigned.push(j);
      continue;
    }
    let placed = false;
    for (const id of j.tech_ids) {
      if (!working.has(id) && isCanceledStatus(j.status)) continue;
      placed = true;
      const list = byTech.get(id) ?? [];
      list.push(j);
      byTech.set(id, list);
    }
    if (!placed) orphanCanceled.push(j);
  }
  const nameOf = (id: string) => allTechs.find((t) => t.id === id)?.name ?? id;
  const sorted = [...techs].sort((a, b) => (a.first_start ?? "").localeCompare(b.first_start ?? "") || a.name.localeCompare(b.name));
  const rows: Row[] = sorted.map((t) => ({
    key: t.employee_id,
    title: t.name,
    subtitle: `${t.job_count} ${t.job_count === 1 ? "job" : "jobs"}${t.first_start ? ` · ${shortRange(t.first_start, t.last_end)}` : ""}`,
    jobs: byTech.get(t.employee_id) ?? [],
  }));
  // Techs that only appear via live jobs but not in getSchedule's list (defensive).
  for (const [id, list] of byTech) {
    if (!working.has(id)) rows.push({ key: id, title: nameOf(id), subtitle: `${list.length} ${list.length === 1 ? "job" : "jobs"}`, jobs: list });
  }
  rows.push({ key: "__unassigned", title: "Unassigned", subtitle: unassigned.length ? `${unassigned.length} to assign` : null, jobs: unassigned, muted: unassigned.length === 0 });
  if (orphanCanceled.length) {
    rows.push({ key: "__canceled", title: "Canceled", subtitle: `${orphanCanceled.length} off the board`, jobs: orphanCanceled, muted: true });
  }
  return rows;
}
