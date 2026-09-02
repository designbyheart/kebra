"use client";

/**
 * A shared ticking clock (default every 30 s) for relative times and the
 * "now" line. Built on useSyncExternalStore so the server snapshot is `null`
 * (server renders absolute times → no hydration mismatch) and every consumer
 * shares one interval.
 */
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let tick = Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    tick = Date.now();
    timer = setInterval(() => {
      tick = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Epoch ms on the client (refreshed every 30 s), `null` during SSR and hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => tick, () => null);
}
