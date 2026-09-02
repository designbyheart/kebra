import { AgentTag } from "@/components/atoms/agent-tag";
import { formatDateTimeET } from "@/lib/time";
import { noteTimeLabel } from "@/lib/ui/board-layout";
import { NOTE_AUTHOR_LABEL } from "@/lib/ui/board-status";
import type { JobNote } from "@/lib/ui/board-types";

export type SheetNoteItemProps = { note: JobNote };

/** One compact note row inside the job sheet. */
export function SheetNoteItem({ note: n }: SheetNoteItemProps) {
  const fromAgent = n.authorType === "agent";
  return (
    <li className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {fromAgent && <AgentTag size="note" />}
        {!fromAgent && <span className="font-medium text-foreground">{NOTE_AUTHOR_LABEL[n.authorType] ?? n.authorType}</span>}
        <span title={formatDateTimeET(n.createdAt)}>{noteTimeLabel(n.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{n.content}</p>
    </li>
  );
}
