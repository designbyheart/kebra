"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockDots } from "@/lib/ui/sensitive";
import { MaskedText } from "./masked-text";

export type MaskedBlockProps = { text: string; label?: string; className?: string };

/** A whole block (access notes) hidden behind a Reveal button. */
export function MaskedBlock({ text, label = "Access notes", className }: MaskedBlockProps) {
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
          {open && <EyeOff className="size-3.5" />}
          {!open && <Eye className="size-3.5" />}
          {open && "Hide"}
          {!open && "Reveal"}
        </button>
      </div>
      {open && (
        <p className="mt-2 text-sm leading-relaxed">
          <MaskedText text={text} />
        </p>
      )}
      {!open && (
        <p className="mt-2 truncate select-none font-mono text-sm tracking-widest text-muted-foreground" aria-hidden>
          {blockDots(text.length)}
        </p>
      )}
    </div>
  );
}
