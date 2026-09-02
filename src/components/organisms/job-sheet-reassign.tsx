"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/atoms/native-select";
import { Button } from "@/components/atoms/ui/button";
import { reassignAction } from "@/app/today/actions";
import type { BoardTech, JobSheetData, Run } from "@/lib/ui/board-types";

const TERMINAL = ["complete rated", "complete unrated", "user canceled", "pro canceled"];

export type JobSheetReassignProps = {
  job: JobSheetData["job"];
  techs: BoardTech[];
  disabled: boolean;
  run: Run;
};

/** Pick another tech for the job. */
export function JobSheetReassign({ job, techs, disabled, run }: JobSheetReassignProps) {
  const current = job.techs[0]?.id ?? "";
  const [techId, setTechId] = useState(current);
  const terminal = TERMINAL.includes(job.workStatus);
  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reassign tech</div>
      <div className="flex items-center gap-2">
        <NativeSelect aria-label="Tech" value={techId} onChange={(e) => setTechId(e.target.value)} disabled={disabled || terminal}>
          <option value="" disabled>
            Choose a tech
          </option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="button" size="sm" disabled={disabled || terminal || !techId || techId === current} onClick={() => run("Tech reassigned", () => reassignAction(job.id, techId))}>
          Reassign
        </Button>
      </div>
      {terminal && <p className="text-sm text-muted-foreground">Closed jobs cannot be reassigned.</p>}
    </section>
  );
}
