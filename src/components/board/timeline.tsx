"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TechDay } from "@/domain/schedule";
import { JobCard, LANE_H, UnscheduledChip, type Flash } from "./job-card";
import { BOARD_HOURS, hourTicks, nowPct, positionFor, shortRange, stackLanes } from "./layout";
import { isCanceledStatus } from "./status";
import type { BoardJob, BoardTech, UnscheduledJob } from "./types";

const LABEL_W = "176px";
const TICKS = hourTicks();

type Row = { key: string; title: string; subtitle: string | null; jobs: BoardJob[]; muted?: boolean };

type Props = {
  date: string;
  /** Live jobs from getSchedule plus canceled jobs on the day. */
  jobs: BoardJob[];
  techs: TechDay[];
  allTechs: BoardTech[];
  needsScheduling: { jobs: UnscheduledJob[]; total: number };
  flash: Record<string, Flash>;
  selectedId: string | null;
  now: Date;
  onSelect: (jobId: string) => void;
};

export function Timeline({ date, jobs, techs, allTechs, needsScheduling, flash, selectedId, now, onSelect }: Props) {
  const rows = useMemo(() => buildRows(jobs, techs, allTechs), [jobs, techs, allTechs]);
  const nowLeft = nowPct(now, date);
  const hasAny = jobs.length > 0;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[960px]">
          {/* Hour header */}
          <div className="grid border-b bg-muted/40 text-xs text-muted-foreground" style={{ gridTemplateColumns: `${LABEL_W} 1fr` }}>
            <div className="px-3 py-1.5 font-medium">Tech</div>
            <div className="relative h-7">
              {TICKS.map((t) => (
                <span key={t.hour} className="absolute top-1.5 border-l border-border pl-1 font-mono tabular-nums" style={{ left: `${t.leftPct}%` }}>
                  {t.label}
                </span>
              ))}
              {nowLeft !== null ? (
                <span
                  className="absolute top-0 z-10 -translate-x-1/2 rounded-b bg-red-500 px-1 font-mono text-xs font-medium tabular-nums text-white"
                  style={{ left: `${nowLeft}%` }}
                >
                  {shortRange(now, null)}
                </span>
              ) : null}
            </div>
          </div>

          {!hasAny ? (
            <div className="grid" style={{ gridTemplateColumns: `${LABEL_W} 1fr` }}>
              <div className="px-3 py-6 text-sm text-muted-foreground">No techs working</div>
              <div className="relative flex items-center px-4 py-6 text-sm text-muted-foreground" style={gridBackground()}>
                Nothing on the board for this day.
              </div>
            </div>
          ) : null}

          {rows.map((row) => (
            <TimelineRow key={row.key} row={row} date={date} flash={flash} selectedId={selectedId} nowLeft={nowLeft} onSelect={onSelect} />
          ))}
        </div>
      </div>

      {/* Needs scheduling lane */}
      <section className="rounded-lg border bg-card">
        <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
          <span className="size-2 rounded-full bg-violet-500" aria-hidden />
          <span className="font-medium">Needs scheduling</span>
          <span className="text-muted-foreground">
            {needsScheduling.total} waiting for a window
            {needsScheduling.total > needsScheduling.jobs.length ? ` · showing ${needsScheduling.jobs.length} most recent` : ""}
          </span>
          <Link href="/jobs?status=needs+scheduling" className="ml-auto text-muted-foreground hover:text-foreground hover:underline">
            All in Jobs →
          </Link>
        </header>
        {needsScheduling.jobs.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Nothing waiting.</p>
        ) : (
          <div className="flex flex-wrap gap-2 p-2">
            {needsScheduling.jobs.map((j) => (
              <UnscheduledChip key={j.job_id} job={j} flash={flash[j.job_id]} selected={selectedId === j.job_id} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TimelineRow({
  row,
  date,
  flash,
  selectedId,
  nowLeft,
  onSelect,
}: {
  row: Row;
  date: string;
  flash: Record<string, Flash>;
  selectedId: string | null;
  nowLeft: number | null;
  onSelect: (jobId: string) => void;
}) {
  const { placed, lanes } = stackLanes(row.jobs);
  const height = row.jobs.length === 0 ? 40 : lanes * LANE_H;
  return (
    <div className={cn("grid border-b last:border-b-0", row.muted && "bg-muted/20")} style={{ gridTemplateColumns: `${LABEL_W} 1fr` }}>
      <div className="flex flex-col justify-center border-r px-3 py-1.5">
        <div className={cn("truncate text-sm font-medium", row.muted && "text-muted-foreground")}>{row.title}</div>
        {row.subtitle ? <div className="truncate text-xs text-muted-foreground">{row.subtitle}</div> : null}
      </div>
      <div className="relative" style={{ height, ...gridBackground() }}>
        {nowLeft !== null ? <span aria-hidden className="absolute inset-y-0 z-[2] w-px bg-red-500/80" style={{ left: `${nowLeft}%` }} /> : null}
        {row.jobs.length === 0 ? <span className="absolute inset-0 flex items-center px-3 text-xs text-muted-foreground">none</span> : null}
        {placed.map(({ item, lane }) => (
          <JobCard
            key={item.job_id}
            job={item}
            position={positionFor(item.window_start, item.window_end, date)}
            lane={lane}
            flash={flash[item.job_id]}
            selected={selectedId === item.job_id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function gridBackground() {
  return {
    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    backgroundSize: `${100 / BOARD_HOURS}% 100%`,
  } as const;
}

/**
 * One row per tech working the day (from getSchedule, earliest start first),
 * then "Unassigned", then a muted "Canceled" row for canceled jobs whose tech
 * has no live work that day. Canceled jobs of a working tech stay in their row.
 */
function buildRows(jobs: BoardJob[], techs: TechDay[], allTechs: BoardTech[]): Row[] {
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
