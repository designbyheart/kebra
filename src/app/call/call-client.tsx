"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { Button } from "@/components/ui/button";

type Status = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";
type Line = { role: "user" | "assistant"; text: string };

type Props = { publicKey: string | null; assistantId: string | null; phoneE164: string; phoneLabel: string };

const STATUS_LABEL: Record<Status, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  speaking: "Brianna is speaking",
  ended: "Call ended",
  error: "Couldn't connect",
};

function nowEastern(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

export function CallClient({ publicKey, assistantId, phoneE164, phoneLabel }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const configured = Boolean(publicKey && assistantId);
  const active = status === "connecting" || status === "listening" || status === "speaking";

  useEffect(() => {
    return () => {
      vapiRef.current?.stop().catch(() => undefined);
      vapiRef.current?.removeAllListeners();
    };
  }, []);

  const start = useCallback(async () => {
    if (!publicKey || !assistantId) return;
    setError(null);
    setLines([]);
    setMuted(false);
    setStatus("connecting");
    try {
      const { default: VapiCtor } = await import("@vapi-ai/web");
      const vapi = new VapiCtor(publicKey);
      vapiRef.current = vapi;
      vapi.on("call-start", () => setStatus("listening"));
      vapi.on("speech-start", () => setStatus("speaking"));
      vapi.on("speech-end", () => setStatus((s) => (s === "speaking" ? "listening" : s)));
      vapi.on("volume-level", (v: number) => setLevel(v));
      vapi.on("call-end", () => {
        setStatus("ended");
        setLevel(0);
        vapiRef.current = null;
      });
      vapi.on("error", (e: unknown) => {
        const msg = (e as { message?: string; errorMsg?: string } | null)?.errorMsg ?? (e as Error)?.message ?? "Call failed";
        setError(String(msg));
        setStatus("error");
        vapiRef.current = null;
      });
      vapi.on("message", (m: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
        if (m?.type === "transcript" && m.transcriptType === "final" && m.transcript) {
          const role = m.role === "assistant" ? "assistant" : "user";
          setLines((prev) => [...prev.slice(-7), { role, text: m.transcript! }]);
        }
      });
      await vapi.start(assistantId, { variableValues: { now_et: nowEastern(), caller_name: "", known_sites: "" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call");
      setStatus("error");
      vapiRef.current = null;
    }
  }, [publicKey, assistantId]);

  const hangUp = useCallback(async () => {
    const v = vapiRef.current;
    if (!v) return setStatus("ended");
    await v.stop().catch(() => undefined);
  }, []);

  const toggleMute = useCallback(() => {
    const v = vapiRef.current;
    if (!v) return;
    const next = !muted;
    v.setMuted(next);
    setMuted(next);
  }, [muted]);

  return (
    // Covers the app shell (sidebar) rendered by the root layout; this page is public.
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gulf Breeze Air</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Talk to the front desk</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Brianna can look up your service history, check warranty, and book or move a visit.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          {!configured ? (
            <p className="text-sm text-muted-foreground">
              Web calling isn&apos;t set up on this deployment yet. Please dial the number below.
            </p>
          ) : !active ? (
            <Button className="h-14 w-full text-base" size="lg" onClick={start}>
              Call Gulf Breeze Air
            </Button>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className={
                      "inline-block size-2.5 rounded-full " +
                      (status === "connecting"
                        ? "animate-pulse bg-amber-500"
                        : status === "speaking"
                          ? "bg-sky-500"
                          : "bg-emerald-500")
                    }
                  />
                  <span role="status">{STATUS_LABEL[status]}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">{muted ? "mic off" : "mic on"}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
                <div
                  className="h-full bg-sky-500 transition-[width] duration-100"
                  style={{ width: `${Math.min(100, Math.round(level * 100))}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={toggleMute} disabled={status === "connecting"}>
                  {muted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="destructive" onClick={hangUp}>
                  Hang up
                </Button>
              </div>
            </div>
          )}

          {(status === "ended" || status === "error") && (
            <p className="mt-4 text-center text-sm text-muted-foreground" role="status">
              {status === "error" ? (error ?? "Couldn't connect. Try again or dial the number below.") : "Thanks for calling."}
            </p>
          )}

          {lines.length > 0 && (
            <ol className="mt-5 max-h-48 space-y-1.5 overflow-y-auto border-t pt-4 text-sm" aria-label="Live transcript">
              {lines.map((l, i) => (
                <li key={i} className={l.role === "assistant" ? "text-foreground" : "text-muted-foreground"}>
                  <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    {l.role === "assistant" ? "Brianna" : "You"}
                  </span>
                  {l.text}
                </li>
              ))}
            </ol>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Prefer to dial?{" "}
          <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${phoneE164}`}>
            {phoneLabel}
          </a>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Calls are recorded and appear on the office board live. Uses your microphone.
        </p>
      </div>
    </div>
  );
}
