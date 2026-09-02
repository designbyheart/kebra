"use client";

import { useCallback, useState } from "react";
import { ActivityItem } from "@/components/molecules/activity-item";
import { useNow } from "@/hooks/use-now";
import { useLiveEvents, type LiveEvent } from "@/lib/use-live-events";
import { cn } from "@/lib/utils";

const FRESH_MS = 3000;

const FEED = {
  open: { dot: "bg-emerald-500 animate-pulse", label: "live" },
  error: { dot: "bg-red-500", label: "offline" },
  connecting: { dot: "bg-amber-500", label: "connecting" },
} as const;

function feedState(status: ReturnType<typeof useLiveEvents>["status"]): keyof typeof FEED {
  if (status === "open") return "open";
  if (status === "error") return "error";
  return "connecting";
}

export type ActivityStripFeedProps = {
  initial: LiveEvent[];
  limit?: number;
  className?: string;
  title?: string;
  error?: string | null;
};

/** Client half of the activity strip: subscribes to the SSE feed and prepends new events. */
export function ActivityStripFeed({ initial, limit = 20, className, title = "Activity", error }: ActivityStripFeedProps) {
  const [items, setItems] = useState<LiveEvent[]>(initial);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  // Relative times only after hydration (server renders absolute times → no mismatch).
  const tick = useNow();
  const now = (tick !== null && new Date(tick)) || null;

  const onEvent = useCallback(
    (e: LiveEvent) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === e.id)) return prev;
        return [e, ...prev].slice(0, limit);
      });
      setFresh((prev) => new Set(prev).add(e.id));
      setTimeout(
        () =>
          setFresh((prev) => {
            if (!prev.has(e.id)) return prev;
            const next = new Set(prev);
            next.delete(e.id);
            return next;
          }),
        FRESH_MS,
      );
    },
    [limit],
  );
  const { status } = useLiveEvents({ since: initial[0]?.id ?? null, onEvent, max: 1 });
  const feed = FEED[feedState(status)];

  return (
    <aside className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)} aria-label={title}>
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">last {limit}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", feed.dot)} aria-hidden />
          {feed.label}
        </span>
      </header>
      {error && <p className="px-3 py-3 text-sm text-muted-foreground">{error}</p>}
      {!error && items.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Nothing has happened yet.</p>}
      <ol className="max-h-[70vh] divide-y overflow-y-auto xl:max-h-[calc(100vh-8rem)]">
        {items.map((e) => (
          <ActivityItem key={e.id} event={e} now={now} fresh={fresh.has(e.id)} />
        ))}
      </ol>
    </aside>
  );
}
