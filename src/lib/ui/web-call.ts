/**
 * View helpers for the public web-call panel (/call). Pure; unit-tested in
 * ./web-call.test.ts.
 */

export type WebCallStatus = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";

export type WebCallLine = { role: "user" | "assistant"; text: string };

export const WEB_CALL_STATUS_LABEL: Record<WebCallStatus, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  speaking: "Brianna is speaking",
  ended: "Call ended",
  error: "Couldn't connect",
};

/** A call is on the wire while connecting or talking. */
export function isActiveCallStatus(status: WebCallStatus): boolean {
  return status === "connecting" || status === "listening" || status === "speaking";
}

/**
 * Width of the live volume bar: a 0–1 level from the audio stream mapped to a
 * whole percentage. It changes many times a second, so it cannot be a class.
 */
export function volumeBarStyle(level: number) {
  return { width: `${Math.min(100, Math.round(level * 100))}%` } as const;
}

/** "Wed, Sep 2, 2026, 3:04 PM EDT" — passed to the assistant as `now_et`. */
export function nowEastern(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
}
