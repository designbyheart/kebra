import { MaskedText } from "@/components/atoms/masked-text";
import { fmtDateTime } from "@/lib/ui/format";
import { AUTHOR_CLASS, AUTHOR_LABEL, type NoteView } from "@/lib/ui/note-view";
import { cn } from "@/lib/utils";

export type NoteItemProps = { note: NoteView };

/** Author pill, timestamp and masked content for one note. */
export function NoteItem({ note }: NoteItemProps) {
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-xs font-medium leading-none ring-1 ring-inset", AUTHOR_CLASS[note.authorType])}>
        {AUTHOR_LABEL[note.authorType]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">
          {note.authorName && <span className="font-medium text-foreground">{note.authorName} · </span>}
          {fmtDateTime(note.createdAt)}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
          <MaskedText text={note.content} />
        </p>
      </div>
    </li>
  );
}
