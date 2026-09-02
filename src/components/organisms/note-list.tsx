import { NoteItem } from "@/components/molecules/note-item";
import type { NoteView } from "@/lib/ui/note-view";
import { cn } from "@/lib/utils";

export type NoteListProps = { notes: NoteView[]; className?: string; emptyText?: string };

/**
 * Read-only notes thread, oldest first. Codes / phones inside the content are
 * masked by default (MaskedText). Server-renderable; MaskedText is the only
 * client island.
 */
export function NoteList({ notes, className, emptyText = "No notes yet." }: NoteListProps) {
  if (notes.length === 0) return <p className={cn("text-sm text-muted-foreground", className)}>{emptyText}</p>;
  return (
    <ol className={cn("space-y-3", className)}>
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} />
      ))}
    </ol>
  );
}
