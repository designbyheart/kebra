"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { Button } from "@/components/atoms/ui/button";
import { cn } from "@/lib/utils";
import { isActiveCallStatus, nowEastern, volumeBarStyle, WEB_CALL_STATUS_LABEL, type WebCallLine, type WebCallStatus } from "@/lib/ui/web-call";

const STATUS_DOT: Record<WebCallStatus, string> = {
  idle: "bg-emerald-500",
  connecting: "animate-pulse bg-amber-500",
  listening: "bg-emerald-500",
  speaking: "bg-sky-500",
  ended: "bg-emerald-500",
  error: "bg-emerald-500",
};

const MIC_LABEL = { on: "mic on", off: "mic off" } as const;
const MUTE_BUTTON_LABEL = { on: "Mute", off: "Unmute" } as const;

const ROLE_CLASS: Record<WebCallLine["role"], string> = { assistant: "text-foreground", user: "text-muted-foreground" };
const ROLE_LABEL: Record<WebCallLine["role"], string> = { assistant: "Brianna", user: "You" };

export type WebCallPanelProps = { publicKey: string | null; assistantId: string | null };

/** The browser call card on /call: start button, live status, mute / hang up and a rolling transcript. */
export function WebCallPanel({ publicKey, assistantId }: WebCallPanelProps) {
  const [status, setStatus] = useState<WebCallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<WebCallLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const configured = Boolean(publicKey && assistantId);
  const active = isActiveCallStatus(status);
  const mic = (muted && "off") || "on";

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
      vapi.on("speech-end", () =>
        setStatus((s) => {
          if (s === "speaking") return "listening";
          return s;
        }),
      );
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
          const role: WebCallLine["role"] = (m.role === "assistant" && "assistant") || "user";
          setLines((prev) => [...prev.slice(-7), { role, text: m.transcript! }]);
        }
      });
      await vapi.start(assistantId, { variableValues: { now_et: nowEastern(), caller_name: "", known_sites: "" } });
    } catch (e) {
      if (e instanceof Error) setError(e.message);
      else setError("Could not start the call");
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
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      {!configured && <p className="text-sm text-muted-foreground">Web calling isn&apos;t set up on this deployment yet. Please dial the number below.</p>}
      {configured && !active && (
        <Button className="h-14 w-full text-base" size="lg" onClick={start}>
          Call Gulf Breeze Air
        </Button>
      )}
      {configured && active && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden className={cn("inline-block size-2.5 rounded-full", STATUS_DOT[status])} />
              <span role="status">{WEB_CALL_STATUS_LABEL[status]}</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{MIC_LABEL[mic]}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
            <div className="h-full bg-sky-500 transition-[width] duration-100" style={volumeBarStyle(level)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={toggleMute} disabled={status === "connecting"}>
              {MUTE_BUTTON_LABEL[mic]}
            </Button>
            <Button variant="destructive" onClick={hangUp}>
              Hang up
            </Button>
          </div>
        </div>
      )}

      {(status === "ended" || status === "error") && (
        <p className="mt-4 text-center text-sm text-muted-foreground" role="status">
          {status === "error" && (error ?? "Couldn't connect. Try again or dial the number below.")}
          {status === "ended" && "Thanks for calling."}
        </p>
      )}

      {lines.length > 0 && (
        <ol className="mt-5 max-h-48 space-y-1.5 overflow-y-auto border-t pt-4 text-sm" aria-label="Live transcript">
          {lines.map((l, i) => (
            <li key={i} className={ROLE_CLASS[l.role]}>
              <span className="mr-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">{ROLE_LABEL[l.role]}</span>
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
