import type { Slot } from "@/domain/availability";
import { RadioInput } from "@/components/atoms/radio-input";
import { SLOT_REASON_LABEL } from "@/lib/ui/job-options";
import { cn } from "@/lib/utils";

const ACTIVE = { on: "bg-accent", off: undefined } as const;

export type SlotRadioRowProps = {
  slot: Slot;
  active: boolean;
  onPick: (slot: Slot) => void;
};

/** One opening in the reschedule dialog: window, tech and why that tech. */
export function SlotRadioRow({ slot, active, onPick }: SlotRadioRowProps) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted", active && ACTIVE.on)}>
      <RadioInput name="slot" checked={active} onChange={() => onPick(slot)} />
      <span className="flex-1">{slot.window_label}</span>
      <span className="text-xs text-muted-foreground">
        {slot.employee_name} · {SLOT_REASON_LABEL[slot.reason]}
      </span>
    </label>
  );
}
