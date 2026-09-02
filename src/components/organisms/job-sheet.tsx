"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SheetPendingCancellationBanner } from "@/components/molecules/sheet-pending-cancellation-banner";
import { Button } from "@/components/atoms/ui/button";
import { Separator } from "@/components/atoms/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/atoms/ui/sheet";
import { addNoteAction, getJobDetailAction } from "@/app/today/actions";
import type { ActionResult, BoardTech, JobSheetData, Run } from "@/lib/ui/board-types";
import { JobSheetHeader } from "./job-sheet-header";
import { JobSheetNotes } from "./job-sheet-notes";
import { JobSheetReassign } from "./job-sheet-reassign";
import { JobSheetReschedule } from "./job-sheet-reschedule";
import { JobSheetStatus } from "./job-sheet-status";

export type JobSheetProps = {
  jobId: string | null;
  date: string;
  techs: BoardTech[];
  /** Bump to reload the open job (a live event touched it). */
  refreshToken: number;
  onClose: () => void;
  onChanged: () => void;
};

/** Side sheet for the selected board card: loads the job and hosts the office actions. */
export function JobSheet({ jobId, date, techs, refreshToken, onClose, onChanged }: JobSheetProps) {
  const [detail, setDetail] = useState<JobSheetData | null>(null);
  const [loadError, setLoadError] = useState<{ jobId: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Derived, not synced: only the detail for the *open* job counts; anything else is "loading".
  const current = (detail && detail.job.id === jobId && detail) || null;
  const currentError = (loadError && loadError.jobId === jobId && loadError.message) || null;
  const loading = Boolean(jobId) && !current && !currentError;

  const applyResult = useCallback((id: string, r: ActionResult<JobSheetData>) => {
    if (r.ok) {
      setDetail(r.data);
      setLoadError(null);
    } else {
      setLoadError({ jobId: id, message: r.error });
    }
  }, []);
  const load = useCallback((id: string) => getJobDetailAction(id).then((r) => applyResult(id, r)), [applyResult]);

  useEffect(() => {
    if (!jobId) return;
    let live = true;
    void getJobDetailAction(jobId).then((r) => {
      if (live) applyResult(jobId, r);
    });
    return () => {
      live = false;
    };
  }, [jobId, refreshToken, applyResult]);

  /** Run a write, toast, reload the sheet and tell the board. */
  const run = useCallback<Run>(
    (label, fn, after) => {
      startTransition(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(label);
          after?.();
          if (jobId) await load(jobId);
          onChanged();
        } else {
          toast.error(r.error);
        }
      });
    },
    [jobId, load, onChanged],
  );

  const job = current?.job ?? null;

  return (
    <Sheet
      open={Boolean(jobId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl" aria-busy={loading || pending}>
        {loading && (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading job…
          </div>
        )}
        {!job && currentError && (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Could not load job</SheetTitle>
              <SheetDescription>{currentError}</SheetDescription>
            </SheetHeader>
            <Button
              className="mt-4"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!jobId) return;
                setLoadError(null);
                void load(jobId);
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {current && job && (
          <>
            <JobSheetHeader job={job} />

            {job.workStatus === "pending_cancellation" && current.pendingCancellation && <SheetPendingCancellationBanner pending={current.pendingCancellation} />}

            <div className="flex flex-col gap-5 p-4">
              <JobSheetNotes key={job.id} notes={current.notes} disabled={pending} onAdd={(text, reset) => run("Note added", () => addNoteAction(job.id, text), reset)} />
              <Separator />
              <JobSheetReschedule key={`rs:${job.id}:${job.workStatus}`} job={job} date={date} techs={techs} serviceTypes={current.serviceTypes} disabled={pending} run={run} />
              <Separator />
              {/* Keyed on the current tech / status so local form state resets when the job changes underneath. */}
              <JobSheetReassign key={`${job.id}:${job.techs[0]?.id ?? ""}`} job={job} techs={techs} disabled={pending} run={run} />
              <Separator />
              <JobSheetStatus key={`st:${job.id}:${job.workStatus}`} job={job} disabled={pending} run={run} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
