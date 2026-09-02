"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { LiveDot } from "@/components/atoms/live-dot";
import { TranscriptItem } from "@/components/molecules/transcript-item";
import { buildTimeline, STATUS_LABEL } from "@/lib/ui/call-derive";
import { cn } from "@/lib/utils";

const MAX_HEIGHT = { live: "max-h-[70vh]", ended: "max-h-[78vh]" } as const;
const ARIA_LIVE = { live: "polite", ended: undefined } as const;

export type CallTranscriptProps = { call: CallDetailData; live: boolean };

/** Scrollable transcript timeline; sticks to the bottom while a live call grows. */
export function CallTranscript({ call, live }: CallTranscriptProps) {
  const items = useMemo(() => buildTimeline(call.transcript, call.toolCalls), [call.transcript, call.toolCalls]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = call.transcript.length + call.toolCalls.length;

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (live && stick.current) el.scrollTop = el.scrollHeight;
  }, [count, live]);

  if (items.length === 0 && live) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <LiveDot /> Waiting for the first words…
        </span>
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No transcript was captured for this call.</div>;
  }

  const state = (live && "live") || "ended";
  return (
    <div ref={box} onScroll={onScroll} className={cn("space-y-3 overflow-y-auto rounded-lg border bg-card p-4", MAX_HEIGHT[state])} aria-live={ARIA_LIVE[state]}>
      {items.map((item, i) => (
        <TranscriptItem key={i} item={item} />
      ))}
      {live && (
        <div className="flex items-center gap-2 pt-1 text-xs text-amber-700 dark:text-amber-400">
          <LiveDot /> Live — {STATUS_LABEL[call.status] ?? call.status}
        </div>
      )}
    </div>
  );
}
