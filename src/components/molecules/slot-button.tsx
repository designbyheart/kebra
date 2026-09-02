"use client";

import { formatWindow } from "@/lib/time";
import { SLOT_REASON_SUFFIX } from "@/lib/ui/board-status";
import type { Slot } from "@/lib/ui/board-types";

export type SlotButtonProps = {
  slot: Slot;
  disabled: boolean;
  onPick: (windowStart: string, employeeId: string | undefined) => void;
};

/** One open arrival window the office can move a job into (job sheet). */
export function SlotButton({ slot: s, disabled, onPick }: SlotButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(s.window_start, s.employee_id)}
      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left text-sm transition-colors hover:border-ring hover:bg-muted disabled:opacity-50"
    >
      <div className="font-medium">{formatWindow(s.window_start, s.window_end)}</div>
      <div className="text-muted-foreground">
        {s.employee_name}
        {SLOT_REASON_SUFFIX[s.reason]}
      </div>
    </button>
  );
}
