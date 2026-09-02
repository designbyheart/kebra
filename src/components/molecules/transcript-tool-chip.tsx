import { Wrench } from "lucide-react";
import type { ToolCallRecord } from "@/db/schema";
import { formatOffset } from "@/lib/ui/call-derive";
import { cn } from "@/lib/utils";

export type TranscriptToolChipProps = { call: ToolCallRecord; label: string; t: number };

/** Centered mono chip for a tool call in the transcript; red when the call failed. */
export function TranscriptToolChip({ call, label, t }: TranscriptToolChipProps) {
  return (
    <div className="flex justify-center">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground",
          call.ok === false && "border-red-300 text-red-700 dark:text-red-300",
        )}
        title={`${call.name} @ ${formatOffset(t)}`}
      >
        <Wrench className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}
