"use client";

import { useEffect, useState } from "react";

/** Re-render every `ms` while `active`; returns the current epoch ms. */
export function useClock(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}
