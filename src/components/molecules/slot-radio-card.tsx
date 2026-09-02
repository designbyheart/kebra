"use client";

import type { Slot } from "@/domain/availability";
import { fmtWindow } from "@/lib/ui/format";
import { SLOT_REASON_LABEL } from "@/lib/ui/customer-view";
import { cn } from "@/lib/utils";

const CARD_CLASS = {
  active: "border-ring bg-accent",
  idle: "hover:bg-muted/60",
} as const;

export type SlotRadioCardProps = {
  slot: Slot;
  active: boolean;
  onPick: (slot: Slot) => void;
};

/** One opening in the Book-a-job dialog: window, tech and why it was suggested. */
export function SlotRadioCard({ slot, active, onPick }: SlotRadioCardProps) {
  const state = (active && "active") || "idle";
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors", CARD_CLASS[state])}>
      <input type="radio" name="slot" className="mt-1" checked={active} onChange={() => onPick(slot)} />
      <span className="min-w-0">
        <span className="block font-medium tabular-nums">{fmtWindow(slot.window_start, slot.window_end)}</span>
        <span className="block text-sm text-muted-foreground">
          {slot.employee_name} · {SLOT_REASON_LABEL[slot.reason]}
        </span>
      </span>
    </label>
  );
}
