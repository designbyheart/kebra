"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Door / gate / lockbox codes and phone numbers are masked by default in the
 * office UI and revealed per click (nothing is logged). The import already
 * replaced most codes with "[code]"; this catches literal digits that slipped
 * through and anything typed later by the office or the agent.
 */
export const SENSITIVE_RE =
  /((?:(?:door|gate|garage|access|master|alarm|keypad|entry|unit|building|lock\s*box|lockbox)\s*)?(?:code|pin|passcode|combo|combination)s?\s*(?:is|:|#|-|=)?\s*#?\s*)([A-Za-z]?\d{3,8}[A-Za-z]?(?:\s*[#*]\s*)?)|((?:lock\s*box|lockbox)\s*(?:is|:|#|-|=)?\s*#?\s*)(\d{3,8})|((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/gi;

export type MaskedSegment = { text: string; sensitive: boolean };

/** Split text into plain and sensitive segments (pure; unit tested). */
export function splitSensitive(text: string): MaskedSegment[] {
  const out: MaskedSegment[] = [];
  let last = 0;
  const re = new RegExp(SENSITIVE_RE.source, SENSITIVE_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0];
    const start = m.index;
    // Keep the label ("gate code: ") visible, mask only the secret part.
    const label = m[1] ?? m[3] ?? "";
    const secret = m[2] ?? m[4] ?? m[5] ?? "";
    if (start > last) out.push({ text: text.slice(last, start), sensitive: false });
    if (label) out.push({ text: label, sensitive: false });
    out.push({ text: secret || full, sensitive: true });
    last = start + full.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), sensitive: false });
  return out.length ? out : [{ text, sensitive: false }];
}

export function hasSensitive(text: string): boolean {
  return splitSensitive(text).some((s) => s.sensitive);
}

function Dots({ n }: { n: number }) {
  return <span aria-hidden>{"•".repeat(Math.max(4, Math.min(n, 8)))}</span>;
}

/** Inline text with each code / phone masked; click a mask to reveal it. */
export function MaskedText({ text, className }: { text: string; className?: string }) {
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const segments = splitSensitive(text);
  if (!segments.some((s) => s.sensitive)) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.sensitive ? (
          <button
            key={i}
            type="button"
            title={revealed.has(i) ? "Click to hide" : "Masked — click to reveal"}
            aria-label={revealed.has(i) ? "Hide sensitive value" : "Reveal sensitive value"}
            onClick={() =>
              setRevealed((prev) => {
                const next = new Set(prev);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                return next;
              })
            }
            className={cn(
              "mx-0.5 inline-flex h-5 items-center rounded px-1 font-mono text-xs leading-none ring-1 ring-inset transition-colors",
              revealed.has(i)
                ? "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800"
                : "bg-muted text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
            )}
          >
            {revealed.has(i) ? s.text : <Dots n={s.text.length} />}
          </button>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

/** A whole block (access notes) hidden behind a Reveal button. */
export function MaskedBlock({ text, label = "Access notes", className }: { text: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-lg border border-dashed bg-muted/40 p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
          aria-expanded={open}
        >
          {open ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {open ? "Hide" : "Reveal"}
        </button>
      </div>
      {open ? (
        <p className="mt-2 text-sm leading-relaxed">
          <MaskedText text={text} />
        </p>
      ) : (
        <p className="mt-2 truncate select-none font-mono text-sm tracking-widest text-muted-foreground" aria-hidden>
          {"•".repeat(Math.min(48, Math.max(16, Math.round(text.length / 3))))}
        </p>
      )}
    </div>
  );
}
