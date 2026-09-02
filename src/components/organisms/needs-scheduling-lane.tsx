import Link from "next/link";
import { UnscheduledChip } from "@/components/molecules/unscheduled-chip";
import type { Flash, UnscheduledJob } from "@/lib/ui/board-types";

export type NeedsSchedulingLaneProps = {
  needsScheduling: { jobs: UnscheduledJob[]; total: number };
  flash: Record<string, Flash>;
  selectedId: string | null;
  onSelect: (jobId: string) => void;
};

/** The backlog lane under the grid: jobs without an arrival window yet. */
export function NeedsSchedulingLane({ needsScheduling, flash, selectedId, onSelect }: NeedsSchedulingLaneProps) {
  const shown = needsScheduling.jobs.length;
  const truncated = (needsScheduling.total > shown && ` · showing ${shown} most recent`) || "";
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-sm">
        <span className="size-2 rounded-full bg-violet-500" aria-hidden />
        <span className="font-medium">Needs scheduling</span>
        <span className="text-xs text-muted-foreground">
          {needsScheduling.total} waiting for a window
          {truncated}
        </span>
        <Link href="/jobs?status=needs+scheduling" className="ml-auto text-muted-foreground hover:text-foreground hover:underline">
          All in Jobs →
        </Link>
      </header>
      {shown === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nothing waiting.</p>}
      {shown > 0 && (
        <div className="flex flex-wrap gap-2 p-2">
          {needsScheduling.jobs.map((j) => (
            <UnscheduledChip key={j.job_id} job={j} flash={flash[j.job_id]} selected={selectedId === j.job_id} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
