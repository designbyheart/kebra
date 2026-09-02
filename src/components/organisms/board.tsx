"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshFailedNotice } from "@/components/molecules/refresh-failed-notice";
import { SessionEndedNotice } from "@/components/molecules/session-ended-notice";
import { useNow } from "@/hooks/use-now";
import { useLiveEvents, type LiveEvent } from "@/lib/use-live-events";
import { diffBoards } from "@/lib/ui/board-diff";
import { boardHref, shiftDate, todayET } from "@/lib/ui/board-layout";
import type { BoardData, BoardJob, FetchState, Flash } from "@/lib/ui/board-types";
import { BoardHeader } from "./board-header";
import { BoardTimeline } from "./board-timeline";
import { JobSheet } from "./job-sheet";

const FLASH_MS = 2600;
const REFETCH_DEBOUNCE_MS = 150;

export type BoardProps = { initial: BoardData };

/**
 * The Today board: server-rendered data kept current over the SSE feed and
 * /api/board, with the job sheet for the selected card.
 */
export function Board({ initial }: BoardProps) {
  const router = useRouter();
  const [data, setData] = useState<BoardData>(initial);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [flash, setFlash] = useState<Record<string, Flash>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const date = initial.date;

  // Clock for the "now" line: server time until hydrated, then a shared 30 s tick.
  const tick = useNow();
  const now = useMemo(() => new Date(tick ?? data.now), [tick, data.now]);

  // Latest values for async callbacks (updated in effects, never during render).
  const dataRef = useRef(data);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inflight = useRef<Promise<void> | null>(null);

  const markFlash = useCallback((ids: Record<string, Flash>) => {
    if (Object.keys(ids).length === 0) return;
    setFlash((prev) => ({ ...prev, ...ids }));
    for (const id of Object.keys(ids)) {
      const existing = flashTimers.current.get(id);
      if (existing) clearTimeout(existing);
      flashTimers.current.set(
        id,
        setTimeout(() => {
          flashTimers.current.delete(id);
          setFlash((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, FLASH_MS),
      );
    }
  }, []);

  const refetch = useCallback(async () => {
    if (inflight.current) return inflight.current;
    setFetchState((s) => {
      if (s === "signed-out") return s;
      return "refreshing";
    });
    const p = (async () => {
      try {
        const res = await fetch(`/api/board?date=${encodeURIComponent(date)}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (res.status === 401) {
          setFetchState("signed-out");
          return;
        }
        if (!res.ok) throw new Error(`board ${res.status}`);
        const next = (await res.json()) as BoardData;
        const changes = diffBoards(dataRef.current, next);
        setData(next);
        setLastUpdate(new Date());
        setFetchState("idle");
        markFlash(changes);
      } catch (err) {
        console.error("[board] refetch failed", err);
        setFetchState("error");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  }, [date, markFlash]);

  // Live: any job.* event → refetch the day (debounced). Note/job events on the open job → reload the sheet.
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onEvent = useCallback(
    (e: LiveEvent) => {
      const touchedJob = (e.payload?.job_id as string | undefined) ?? ((e.entityType === "job" && e.entityId) || undefined);
      if (e.type.startsWith("job.")) {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => void refetch(), REFETCH_DEBOUNCE_MS);
      }
      if (touchedJob && touchedJob === selectedRef.current) setSheetRefresh((n) => n + 1);
    },
    [refetch],
  );
  const live = useLiveEvents({ onEvent, max: 1 });

  // Whenever the stream (re)opens, reconcile once — covers anything that landed while we were disconnected.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (live.status === "open" && !wasOpen.current) {
      wasOpen.current = true;
      void refetch();
    } else if (live.status !== "open") {
      wasOpen.current = false;
    }
  }, [live.status, refetch]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const go = useCallback(
    (d: string) => {
      router.push(boardHref(d));
    },
    [router],
  );

  // Keyboard: ← / → switch days, t = today. Ignored while typing or with the sheet open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (selectedRef.current) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(shiftDate(date, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(shiftDate(date, 1));
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        go(todayET());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, go]);

  const isToday = date === todayET(now);
  const allJobs = useMemo<BoardJob[]>(() => [...data.schedule.jobs, ...data.canceled], [data.schedule.jobs, data.canceled]);
  const retry = useCallback(() => void refetch(), [refetch]);

  return (
    <div className="flex flex-col gap-4">
      <BoardHeader
        date={date}
        isToday={isToday}
        speechHint={data.schedule.speech_hint}
        summary={data.schedule.summary}
        needsSchedulingTotal={data.needsScheduling.total}
        liveStatus={live.status}
        fetchState={fetchState}
        lastUpdate={lastUpdate}
        onRetry={refetch}
        onChangeDate={go}
      />

      {fetchState === "signed-out" && <SessionEndedNotice date={date} />}
      {fetchState === "error" && <RefreshFailedNotice onRetry={retry} />}

      <BoardTimeline
        date={date}
        jobs={allJobs}
        techs={data.schedule.techs}
        allTechs={data.techs}
        needsScheduling={data.needsScheduling}
        flash={flash}
        selectedId={selectedId}
        now={now}
        onSelect={setSelectedId}
      />

      <JobSheet jobId={selectedId} date={date} techs={data.techs} refreshToken={sheetRefresh} onClose={() => setSelectedId(null)} onChanged={retry} />
    </div>
  );
}
