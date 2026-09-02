"use client";

import Link from "next/link";
import { Button } from "@/components/atoms/ui/button";

export type BookingConfirmationProps = {
  line: string;
  jobId: string;
  onDone: () => void;
};

/** Green confirmation line plus "Open job" / "Done" after a booking succeeds. */
export function BookingConfirmation({ line, jobId, onDone }: BookingConfirmationProps) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">{line}</p>
      <div className="flex gap-2">
        <Button nativeButton={false} render={<Link href={`/jobs/${jobId}`} />}>
          Open job
        </Button>
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
