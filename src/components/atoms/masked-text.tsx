"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { maskDots, splitSensitive } from "@/lib/ui/sensitive";

const MASK = {
  hidden: "bg-muted text-muted-foreground ring-border hover:bg-accent hover:text-foreground",
  revealed: "bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800",
} as const;

const TITLE = { hidden: "Masked — click to reveal", revealed: "Click to hide" } as const;
const ARIA = { hidden: "Reveal sensitive value", revealed: "Hide sensitive value" } as const;

export type MaskedTextProps = { text: string; className?: string };

/** Inline text with each code / phone masked; click a mask to reveal it. */
export function MaskedText({ text, className }: MaskedTextProps) {
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const segments = splitSensitive(text);
  if (!segments.some((s) => s.sensitive)) return <span className={className}>{text}</span>;

  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <span className={className}>
      {segments.map((s, i) => {
        if (!s.sensitive) return <span key={i}>{s.text}</span>;
        const state = revealed.has(i) && "revealed";
        const key = state || "hidden";
        return (
          <button
            key={i}
            type="button"
            title={TITLE[key]}
            aria-label={ARIA[key]}
            onClick={() => toggle(i)}
            className={cn("mx-0.5 inline-flex h-5 items-center rounded px-1 font-mono text-xs leading-none ring-1 ring-inset transition-colors", MASK[key])}
          >
            {key === "revealed" && s.text}
            {key === "hidden" && <span aria-hidden>{maskDots(s.text.length)}</span>}
          </button>
        );
      })}
    </span>
  );
}
