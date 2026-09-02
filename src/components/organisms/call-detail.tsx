"use client";

import { useCallback, useState } from "react";
import type { CallDetail as CallDetailData } from "@/app/calls/data";
import { SectionTitle } from "@/components/atoms/section-title";
import { CallRecording } from "@/components/molecules/call-recording";
import { CallSummaryCard } from "@/components/molecules/call-summary-card";
import { CallActionsSection } from "@/components/organisms/call-actions-section";
import { CallPromisesSection } from "@/components/organisms/call-promises-section";
import { CallSummarySection } from "@/components/organisms/call-summary-section";
import { CallTranscript } from "@/components/organisms/call-transcript";
import { ReviewControls } from "@/components/organisms/review-controls";
import { formatTimeET } from "@/lib/time";
import { callDetailAside, detailPollMs, durationSeconds, isLive } from "@/lib/ui/call-derive";
import { useCallFeed } from "@/hooks/use-call-feed";
import { useClock } from "@/hooks/use-clock";

export type CallDetailProps = { initial: CallDetailData };

/**
 * The call page body: transcript on the left, facts / review / actions /
 * promises / summary on the right. Live-refreshes through `useCallFeed`.
 */
export function CallDetail({ initial }: CallDetailProps) {
  const [version, setVersion] = useState(0);
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await fetch(`/api/calls/${initial.id}`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error(`refresh failed (${res.status})`);
      const json = (await res.json()) as { ok: boolean; call: CallDetailData };
      if (!json.ok) return null;
      return json.call;
    },
    [initial.id],
  );
  const [pollMs, setPollMs] = useState(detailPollMs(isLive(initial.status)));
  const { data: call, lastRefreshAt, sse } = useCallFeed<CallDetailData>({
    initial,
    fetcher,
    intervalMs: pollMs,
    callId: initial.id,
    version,
  });
  const live = isLive(call.status);
  // Poll fast only while the call is live; the change is driven by fetched data, not by an effect.
  const wantMs = detailPollMs(live);
  if (wantMs !== pollMs) setPollMs(wantMs);
  const now = useClock(1000, live);
  const secs = durationSeconds(call.startedAt, call.endedAt, new Date(now));
  const refreshed = (lastRefreshAt != null && formatTimeET(lastRefreshAt)) || null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0">
        <SectionTitle aside={<span className="text-xs text-muted-foreground">{callDetailAside({ turns: call.transcript.length, toolCalls: call.toolCalls.length, live, sse, refreshed })}</span>}>
          Transcript
        </SectionTitle>
        <CallTranscript call={call} live={live} />
        {call.recordingUrl && <CallRecording url={call.recordingUrl} />}
      </section>

      <aside className="space-y-5">
        <CallSummaryCard call={call} secs={secs} live={live} />
        <ReviewControls call={call} onChanged={() => setVersion((v) => v + 1)} />
        <CallActionsSection call={call} />
        <CallPromisesSection call={call} live={live} />
        <CallSummarySection call={call} live={live} />
      </aside>
    </div>
  );
}
