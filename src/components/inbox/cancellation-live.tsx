"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["job.cancellation_requested", "job.cancellation_approved", "job.cancellation_rejected"] as const;

/**
 * Refreshes the current server-rendered page when a cancellation event lands
 * on the SSE feed (`/api/events/stream` sends named events per `type`).
 * Renders nothing. Self-contained so W2-E does not collide with whichever unit
 * ends up owning the shared `useLiveEvents` hook.
 */
export function CancellationLiveRefresh({ types = TYPES as readonly string[] }: { types?: readonly string[] }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events/stream");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      // Coalesce bursts (approve writes one event, but neighbours may too).
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    for (const t of types) es.addEventListener(t, bump);
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [router, types]);
  return null;
}
