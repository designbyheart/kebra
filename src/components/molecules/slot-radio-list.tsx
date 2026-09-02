import type { Slot } from "@/domain/availability";
import { SlotRadioRow } from "@/components/molecules/slot-radio-row";
import { slotKey } from "@/lib/ui/job-options";

export type SlotRadioListProps = {
  slots: Slot[];
  picked: Slot | null;
  onPick: (slot: Slot) => void;
};

/** Openings returned by the availability search, or the empty note when the week has none. */
export function SlotRadioList({ slots, picked, onPick }: SlotRadioListProps) {
  if (slots.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">No openings in that week. Try another start date or service.</p>;
  }
  const pickedKey = (picked && slotKey(picked)) || null;
  return (
    <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
      <legend className="sr-only">Openings</legend>
      {slots.map((s) => {
        const key = slotKey(s);
        return <SlotRadioRow key={key} slot={s} active={pickedKey === key} onPick={onPick} />;
      })}
    </fieldset>
  );
}
