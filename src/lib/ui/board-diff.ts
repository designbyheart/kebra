/**
 * Which cards are new or changed between two board loads, for the flash
 * highlight after a live refresh. Pure; unit-tested in ./board-diff.test.ts.
 */
import type { BoardData, BoardJob, Flash, UnscheduledJob } from "./board-types";

const sig = (j: BoardJob) => `${j.status}|${j.window_start}|${j.window_end}|${j.tech_ids.join(",")}|${j.priority}|${j.description ?? ""}`;
const unscheduledSig = (j: UnscheduledJob) => `${j.status}|${j.tech_ids.join(",")}|${j.priority}`;

export function diffBoards(prev: BoardData, next: BoardData): Record<string, Flash> {
  const before = new Map<string, string>();
  for (const j of [...prev.schedule.jobs, ...prev.canceled]) before.set(j.job_id, sig(j));
  for (const j of prev.needsScheduling.jobs) before.set(j.job_id, unscheduledSig(j));
  const out: Record<string, Flash> = {};
  for (const j of [...next.schedule.jobs, ...next.canceled]) {
    const was = before.get(j.job_id);
    if (was === undefined) out[j.job_id] = "new";
    else if (was !== sig(j)) out[j.job_id] = "changed";
  }
  for (const j of next.needsScheduling.jobs) {
    const was = before.get(j.job_id);
    const now = unscheduledSig(j);
    if (was === undefined) out[j.job_id] = "new";
    else if (was !== now) out[j.job_id] = "changed";
  }
  return out;
}
