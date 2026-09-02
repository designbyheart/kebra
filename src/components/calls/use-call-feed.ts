"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live refresh for the Calls pages (W2-C).
 *
 * Two triggers feed one debounced `refetch`:
 *  1. SSE from `/api/events/stream`: any event whose type is in `eventTypes`
 *     (optionally restricted to one `callId`) refetches immediately.
 *  2. Polling every `intervalMs` (transcript rows are appended to the call row
 *     by the voice webhook without an event, so a live call must be polled).
 *
 * `fetcher` is called with an AbortSignal and must return the new state; the
 * hook keeps the last good value and a `lastRefreshAt` timestamp.
 */

// Named SSE events only fire for listeners registered by name.
export const CALL_FEED_EVENT_TYPES = [
  "call.started",
  "call.identified",
  "call.transfer_attempted",
  "call.transfer_failed",
  "call.ended",
  "call.analyzed",
  "call.reviewed",
  "job.booked",
  "job.rescheduled",
  "job.reassigned",
  "job.status_changed",
  "job.cancellation_requested",
  "job.cancellation_approved",
  "job.cancellation_rejected",
  "note.added",
  "task.created",
  "task.updated",
  "customer.phone_added",
] as const;

type Options<T> = {
  initial: T;
  fetcher: (signal: AbortSignal) => Promise<T | null>;
  intervalMs: number | null;
  /** Only react to SSE rows with this call_id (detail page). */
  callId?: string | null;
  eventTypes?: readonly string[];
  /** Change this to force an immediate refetch (e.g. after a server action). */
  version?: number;
};

/**
 * `initial` is only read on mount: parents that re-render with new server
 * data (e.g. a filter change) must remount with a `key`.
 */
export function useCallFeed<T>({ initial, fetcher, intervalMs, callId = null, eventTypes = CALL_FEED_EVENT_TYPES, version = 0 }: Options<T>) {
  const [data, setData] = useState<T>(initial);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sse, setSse] = useState<"connecting" | "open" | "closed">("connecting");
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);
  const inflight = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useRef(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const next = await fetcherRef.current(ac.signal);
      if (ac.signal.aborted) return;
      if (next !== null) {
        setData(next);
        setError(null);
      }
      setLastRefreshAt(Date.now());
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  });

  // Debounced trigger so a burst of events costs one request.
  const schedule = useRef((delay = 150) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refetch.current(), delay);
  });

  useEffect(() => {
    if (version > 0) schedule.current(0);
  }, [version]);

  // Polling
  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(() => void refetch.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  // SSE
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setSse("open");
    es.onerror = () => setSse("closed"); // the browser reconnects on its own
    const onEvent = (e: MessageEvent) => {
      if (callId) {
        try {
          const row = JSON.parse(e.data) as { callId?: string | null; call_id?: string | null };
          const rowCallId = row.callId ?? row.call_id ?? null;
          if (rowCallId !== callId) return;
        } catch {
          return;
        }
      }
      schedule.current();
    };
    for (const type of eventTypes) es.addEventListener(type, onEvent);
    return () => {
      for (const type of eventTypes) es.removeEventListener(type, onEvent);
      es.close();
    };
  }, [callId, eventTypes]);

  // Refetch when the tab becomes visible again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") schedule.current(0);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(
    () => () => {
      inflight.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { data, setData, refetch: () => schedule.current(0), lastRefreshAt, error, sse };
}

/** Re-render every `ms` while `active`; returns the current epoch ms. */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
