"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveEvents, type LiveEvent } from "@/lib/use-live-events";
import { DateSwitcher } from "./date-switcher";
import type { Flash } from "./job-card";
import { JobSheet } from "./job-sheet";
import { longDateLabel, shortRange, todayET } from "./layout";
import { Timeline } from "./timeline";
import type { BoardData, BoardJob } from "./types";
import { useNow } from "./use-now";

const FLASH_MS = 2600;
const REFETCH_DEBOUNCE_MS = 150;

type FetchState = "idle" | "refreshing" | "error" | "signed-out";

export function Board({ initial }: { initial: BoardData }) {
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
  const now = useMemo(() => (tick === null ? new Date(data.now) : new Date(tick)), [tick, data.now]);

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
    setFetchState((s) => (s === "signed-out" ? s : "refreshing"));
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
      const touchedJob = (e.payload?.job_id as string | undefined) ?? (e.entityType === "job" ? e.entityId ?? undefined : undefined);
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
      router.push(d === todayET() ? "/today" : `/today?date=${d}`);
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
        go(shiftDay(date, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(shiftDay(date, 1));
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        go(todayET());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, go]);

  const s = data.schedule.summary;
  const isToday = date === todayET(now);
  const allJobs = useMemo<BoardJob[]>(() => [...data.schedule.jobs, ...data.canceled], [data.schedule.jobs, data.canceled]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isToday ? "Today" : longDateLabel(date).split(",")[0]}
              <span className="ml-2 text-base font-normal text-muted-foreground">{longDateLabel(date)}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.schedule.speech_hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <LiveDot status={live.status} fetchState={fetchState} lastUpdate={lastUpdate} onRetry={refetch} />
            <DateSwitcher date={date} onChange={go} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Chip>{s.total} {s.total === 1 ? "job" : "jobs"}</Chip>
          <Chip>{s.techs_working} {s.techs_working === 1 ? "tech" : "techs"}</Chip>
          {s.first_start && s.last_end ? <Chip>{shortRange(s.first_start, s.last_end)}</Chip> : null}
          {s.in_progress ? <Chip tone="amber">{s.in_progress} in progress</Chip> : null}
          {s.unassigned ? <Chip tone="blue">{s.unassigned} unassigned</Chip> : null}
          {s.pending_cancellation ? <Chip tone="red">{s.pending_cancellation} pending cancellation</Chip> : null}
          {data.needsScheduling.total ? <Chip tone="violet">{data.needsScheduling.total} need scheduling</Chip> : null}
          {s.canceled ? <Chip tone="gray">{s.canceled} canceled</Chip> : null}
          {s.installs ? <Chip>{s.installs} {s.installs === 1 ? "install" : "installs"}</Chip> : null}
          {s.callbacks ? <Chip>{s.callbacks} {s.callbacks === 1 ? "callback" : "callbacks"}</Chip> : null}
          <span className="ml-auto hidden text-muted-foreground sm:inline">← → days · t today · all times ET</span>
        </div>
      </header>

      {fetchState === "signed-out" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
          Your session ended. <a href={`/login?next=${encodeURIComponent(`/today?date=${date}`)}`} className="font-medium underline">Sign in again</a> to keep the board live.
        </div>
      ) : null}
      {fetchState === "error" ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50">
          Could not refresh the board.
          <button type="button" className="font-medium underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <Timeline
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

      <JobSheet jobId={selectedId} date={date} techs={data.techs} refreshToken={sheetRefresh} onClose={() => setSelectedId(null)} onChanged={() => void refetch()} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Chip({ children, tone }: { children: React.ReactNode; tone?: "amber" | "blue" | "red" | "violet" | "gray" }) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
    blue: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100",
    red: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
    violet: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 font-medium tabular-nums", tone ? tones[tone] : "bg-muted text-foreground")}>{children}</span>;
}

function LiveDot({
  status,
  fetchState,
  lastUpdate,
  onRetry,
}: {
  status: ReturnType<typeof useLiveEvents>["status"];
  fetchState: FetchState;
  lastUpdate: Date | null;
  onRetry: () => void;
}) {
  const label = status === "open" ? "Live" : status === "connecting" || status === "idle" ? "Connecting" : "Reconnecting";
  const color = status === "open" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-amber-500";
  return (
    <button
      type="button"
      onClick={onRetry}
      title={lastUpdate ? `Last refreshed ${lastUpdate.toLocaleTimeString()} · click to refresh` : "Click to refresh"}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {fetchState === "refreshing" ? <Loader2 className="size-3 animate-spin" /> : <Radio className="size-3" />}
      <span className={cn("size-1.5 rounded-full", color, status === "open" && "animate-pulse")} aria-hidden />
      {label}
    </button>
  );
}

function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Which cards are new or changed between two loads (for the flash highlight). */
export function diffBoards(prev: BoardData, next: BoardData): Record<string, Flash> {
  const sig = (j: BoardJob) => `${j.status}|${j.window_start}|${j.window_end}|${j.tech_ids.join(",")}|${j.priority}|${j.description ?? ""}`;
  const before = new Map<string, string>();
  for (const j of [...prev.schedule.jobs, ...prev.canceled]) before.set(j.job_id, sig(j));
  for (const j of prev.needsScheduling.jobs) before.set(j.job_id, `${j.status}|${j.tech_ids.join(",")}|${j.priority}`);
  const out: Record<string, Flash> = {};
  for (const j of [...next.schedule.jobs, ...next.canceled]) {
    const was = before.get(j.job_id);
    if (was === undefined) out[j.job_id] = "new";
    else if (was !== sig(j)) out[j.job_id] = "changed";
  }
  for (const j of next.needsScheduling.jobs) {
    const was = before.get(j.job_id);
    const now = `${j.status}|${j.tech_ids.join(",")}|${j.priority}`;
    if (was === undefined) out[j.job_id] = "new";
    else if (was !== now) out[j.job_id] = "changed";
  }
  return out;
}
