"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeET, formatTimeET } from "@/lib/time";
import { actorLabelOf, useLiveEvents, type LiveEvent } from "@/lib/use-live-events";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/components/board/layout";
import { AGENT_BADGE } from "@/components/board/status";
import { useNow } from "@/components/board/use-now";

const ACTOR_DOT: Record<LiveEvent["actor"], string> = {
  agent: "bg-teal-500",
  office: "bg-blue-500",
  system: "bg-gray-400",
};

export function ActivityStripClient({
  initial,
  limit = 20,
  className,
  title = "Activity",
  error,
}: {
  initial: LiveEvent[];
  limit?: number;
  className?: string;
  title?: string;
  error?: string | null;
}) {
  const [items, setItems] = useState<LiveEvent[]>(initial);
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  // Relative times only after hydration (server renders absolute times → no mismatch).
  const tick = useNow();
  const now = tick === null ? null : new Date(tick);

  const onEvent = useCallback(
    (e: LiveEvent) => {
      setItems((prev) => (prev.some((p) => p.id === e.id) ? prev : [e, ...prev].slice(0, limit)));
      setFresh((prev) => new Set(prev).add(e.id));
      setTimeout(() => setFresh((prev) => {
        if (!prev.has(e.id)) return prev;
        const next = new Set(prev);
        next.delete(e.id);
        return next;
      }), 3000);
    },
    [limit],
  );
  const { status } = useLiveEvents({ since: initial[0]?.id ?? null, onEvent, max: 1 });

  return (
    <aside className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)} aria-label={title}>
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">last {limit}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", status === "open" ? "bg-emerald-500 animate-pulse" : status === "error" ? "bg-red-500" : "bg-amber-500")} aria-hidden />
          {status === "open" ? "live" : status === "error" ? "offline" : "connecting"}
        </span>
      </header>
      {error ? <p className="px-3 py-3 text-xs text-muted-foreground">{error}</p> : null}
      {!error && items.length === 0 ? <p className="px-3 py-3 text-xs text-muted-foreground">Nothing has happened yet.</p> : null}
      <ol className="max-h-[70vh] divide-y overflow-y-auto xl:max-h-[calc(100vh-8rem)]">
        {items.map((e) => {
          const summary = typeof e.payload?.summary === "string" ? e.payload.summary : e.type;
          const isAgent = e.actor === "agent";
          return (
            <li key={e.id} className={cn("flex gap-2 px-3 py-2 text-xs transition-colors", fresh.has(e.id) && "animate-in fade-in slide-in-from-top-1 bg-teal-50 duration-500 dark:bg-teal-950/30")}>
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", ACTOR_DOT[e.actor] ?? "bg-gray-400")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{actorLabelOf(e)}</span>
                  {isAgent ? <Badge className={cn("h-4 px-1.5 text-xs uppercase tracking-wide", AGENT_BADGE)}>Agent</Badge> : null}
                  <time dateTime={e.ts} title={formatDateTimeET(e.ts)} className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {now ? relativeTime(e.ts, now) : formatTimeET(e.ts)}
                  </time>
                </div>
                <p className="line-clamp-3 break-words text-muted-foreground">{summary}</p>
                {e.callId ? (
                  <Link href={`/calls/${encodeURIComponent(e.callId)}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
                    <Phone className="size-3" /> View call
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
