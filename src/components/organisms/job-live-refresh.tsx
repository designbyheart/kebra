"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveEvents, type LiveEvent } from "@/lib/use-live-events";

export type JobLiveRefreshProps = { jobId: string };

/**
 * Re-renders the job page when the agent (or another office user) touches
 * this job: any `job.*` event for it, or a note added to it. Debounced so a
 * burst of events triggers one refresh.
 */
export function JobLiveRefresh({ jobId }: JobLiveRefreshProps) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = (e: LiveEvent) => {
    const p = e.payload ?? {};
    if (e.type.startsWith("job.")) return e.entityId === jobId || p.job_id === jobId;
    if (e.type === "note.added") return p.job_id === jobId;
    if (e.type.startsWith("task.")) return p.job_id === jobId;
    return false;
  };

  useLiveEvents({
    filter: matches,
    max: 1,
    onEvent: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    },
  });

  return null;
}
