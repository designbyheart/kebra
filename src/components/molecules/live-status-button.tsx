"use client";

import { Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveStatus } from "@/lib/use-live-events";
import type { FetchState } from "@/lib/ui/board-types";

const LABEL: Record<LiveStatus, string> = {
  open: "Live",
  connecting: "Connecting",
  idle: "Connecting",
  reconnecting: "Reconnecting",
  error: "Reconnecting",
};

const DOT: Record<LiveStatus, string> = {
  open: "bg-emerald-500",
  error: "bg-red-500",
  idle: "bg-amber-500",
  connecting: "bg-amber-500",
  reconnecting: "bg-amber-500",
};

export type LiveStatusButtonProps = {
  status: LiveStatus;
  fetchState: FetchState;
  lastUpdate: Date | null;
  onRetry: () => void;
};

/** Live / Connecting / Reconnecting pill on the board header; click refreshes. */
export function LiveStatusButton({ status, fetchState, lastUpdate, onRetry }: LiveStatusButtonProps) {
  const refreshing = fetchState === "refreshing";
  const title = (lastUpdate && `Last refreshed ${lastUpdate.toLocaleTimeString()} · click to refresh`) || "Click to refresh";
  return (
    <button
      type="button"
      onClick={onRetry}
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {refreshing && <Loader2 className="size-3 animate-spin" />}
      {!refreshing && <Radio className="size-3" />}
      <span className={cn("size-1.5 rounded-full", DOT[status], status === "open" && "animate-pulse")} aria-hidden />
      {LABEL[status]}
    </button>
  );
}
