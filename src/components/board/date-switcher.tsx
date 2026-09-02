"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isValidDate, shiftDate, todayET } from "./layout";

export function DateSwitcher({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayET();
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Choose day">
      <Button variant="outline" size="icon-sm" onClick={() => onChange(shiftDate(date, -1))} aria-label="Previous day" title="Previous day (←)">
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="sm" onClick={() => onChange(today)} disabled={date === today} title="Jump to today (t)">
        Today
      </Button>
      <Button variant="outline" size="icon-sm" onClick={() => onChange(shiftDate(date, 1))} aria-label="Next day" title="Next day (→)">
        <ChevronRight />
      </Button>
      <input
        type="date"
        value={date}
        onChange={(e) => {
          if (isValidDate(e.target.value)) onChange(e.target.value);
        }}
        aria-label="Pick a date"
        className="h-7 rounded-md border border-input bg-background px-2 font-mono text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}
