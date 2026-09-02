"use client";

/**
 * `useLiveEvents` — one small client hook over `GET /api/events/stream`.
 *
 * Uses fetch + a hand-rolled SSE parser instead of `EventSource` because the
 * server names each frame after its event type (`event: job.booked`), and
 * EventSource only delivers named frames to listeners registered for that
 * exact name. Reconnects with `?since=<last id>` so nothing is missed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type LiveEvent = {
  id: number;
  ts: string;
  actor: "agent" | "office" | "system";
  actorId: string | null;
  callId: string | null;
  type: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
};

export type LiveStatus = "idle" | "connecting" | "open" | "reconnecting" | "error";

export type UseLiveEventsOptions = {
  /** Keep only events matching this predicate (default: all). */
  filter?: (e: LiveEvent) => boolean;
  /** Called for every matching event as it arrives (after `filter`). */
  onEvent?: (e: LiveEvent) => void;
  /** Resume from this event id (e.g. the newest id the server rendered). Omit to start from "now". */
  since?: number | null;
  /** Cap on the buffered `events` list (newest first). Default 50. */
  max?: number;
  /** Set false to pause the subscription. */
  enabled?: boolean;
};

export type UseLiveEvents = {
  events: LiveEvent[];
  lastId: number | null;
  status: LiveStatus;
  /** Drop buffered events (the subscription stays open). */
  clear: () => void;
};

const RECONNECT_MS = 2000;
const STREAM_PATH = "/api/events/stream";

export function useLiveEvents(opts: UseLiveEventsOptions = {}): UseLiveEvents {
  const { since = null, max = 50, enabled = true } = opts;
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [lastId, setLastId] = useState<number | null>(since);

  // Latest callbacks without re-subscribing when they change identity (written in an effect, not during render).
  const filterRef = useRef(opts.filter);
  const onEventRef = useRef(opts.onEvent);
  const maxRef = useRef(max);
  const { filter, onEvent } = opts;
  useEffect(() => {
    filterRef.current = filter;
    onEventRef.current = onEvent;
    maxRef.current = max;
  }, [filter, onEvent, max]);
  const lastIdRef = useRef<number | null>(since);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deliver = (e: LiveEvent) => {
      if (typeof e.id === "number" && (lastIdRef.current === null || e.id > lastIdRef.current)) {
        lastIdRef.current = e.id;
        setLastId(e.id);
      }
      if (filterRef.current && !filterRef.current(e)) return;
      setEvents((prev) => {
        if (prev.some((p) => p.id === e.id)) return prev;
        const next = [e, ...prev];
        return next.length > maxRef.current ? next.slice(0, maxRef.current) : next;
      });
      onEventRef.current?.(e);
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      setStatus("reconnecting");
      timer = setTimeout(connect, RECONNECT_MS);
    };

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      setStatus((s) => (s === "reconnecting" ? s : "connecting"));
      const url = lastIdRef.current !== null ? `${STREAM_PATH}?since=${lastIdRef.current}` : STREAM_PATH;
      try {
        const res = await fetch(url, {
          headers: { Accept: "text/event-stream" },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setStatus("error");
          scheduleReconnect();
          return;
        }
        setStatus("open");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const parsed = parseFrame(frame);
            if (parsed) deliver(parsed);
          }
        }
        scheduleReconnect();
      } catch (err) {
        if (stopped || (err instanceof DOMException && err.name === "AbortError")) return;
        setStatus("error");
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [enabled]);

  return { events, lastId, status: enabled ? status : "idle", clear };
}

/** One SSE frame → LiveEvent, or null for comments, heartbeats and `event: error`. */
export function parseFrame(frame: string): LiveEvent | null {
  let eventName = "message";
  const data: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0 || eventName === "error") return null;
  try {
    const row = JSON.parse(data.join("\n")) as Partial<LiveEvent> & { id?: number | string };
    if (row == null || typeof row !== "object" || row.id == null || typeof row.type !== "string") return null;
    return {
      id: Number(row.id),
      ts: String(row.ts ?? new Date().toISOString()),
      actor: (row.actor as LiveEvent["actor"]) ?? "system",
      actorId: row.actorId ?? null,
      callId: row.callId ?? null,
      type: row.type,
      entityType: String(row.entityType ?? ""),
      entityId: row.entityId ?? null,
      payload: (row.payload as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  }
}

/** Display label for an event's actor: `payload.actor_label` when set, else a sensible default. */
export function actorLabelOf(e: Pick<LiveEvent, "actor" | "payload">): string {
  const label = e.payload?.actor_label;
  if (typeof label === "string" && label.trim()) return label;
  if (e.actor === "agent") return "Agent";
  if (e.actor === "system") return "System";
  return "Office";
}
