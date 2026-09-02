"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveEvents } from "@/lib/use-live-events";

const REFRESH_RE = /^(task\.|job\.cancellation_)/;

/** Renders nothing and takes no props. */
export type InboxLiveRefreshProps = Record<string, never>;

/**
 * Re-renders the inbox when a task is created / updated or a cancellation
 * request is filed / resolved anywhere (the agent on a call, another office
 * user, the Today board). Coalesces bursts. Renders nothing.
 */
export function InboxLiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLiveEvents({
    filter: (e) => REFRESH_RE.test(e.type),
    onEvent: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 200);
    },
    max: 1,
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return null;
}
