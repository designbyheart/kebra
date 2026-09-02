"use client";

import { useState } from "react";
import { SheetNoteItem } from "@/components/molecules/sheet-note-item";
import { Button } from "@/components/atoms/ui/button";
import { Label } from "@/components/atoms/ui/label";
import { Textarea } from "@/components/atoms/ui/textarea";
import type { JobSheetData } from "@/lib/ui/board-types";

export type JobSheetNotesProps = {
  notes: JobSheetData["notes"];
  disabled: boolean;
  onAdd: (text: string, reset: () => void) => void;
};

/** Notes list plus the add-note form inside the job sheet. */
export function JobSheetNotes({ notes, disabled, onAdd }: JobSheetNotesProps) {
  const [text, setText] = useState("");
  return (
    <section className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes ({notes.length})</div>
      {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {notes.map((n) => (
          <SheetNoteItem key={n.id} note={n} />
        ))}
      </ol>
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onAdd(text, () => setText(""));
        }}
      >
        <Label htmlFor="new-note" className="sr-only">
          Add a note
        </Label>
        <Textarea id="new-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the tech or the office…" rows={2} disabled={disabled} className="text-sm" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={disabled || !text.trim()}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}
