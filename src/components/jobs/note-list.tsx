import type { Note } from "@/db/schema";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "./format";
import { MaskedText } from "./masked-text";

export const AUTHOR_LABEL: Record<Note["authorType"], string> = {
  tech: "Tech",
  office: "Office",
  agent: "Agent",
  system: "System",
};

const AUTHOR_CLASS: Record<Note["authorType"], string> = {
  tech: "bg-muted text-muted-foreground ring-border",
  office: "bg-muted text-foreground ring-border",
  agent: "bg-teal-600 text-white ring-teal-700 dark:bg-teal-500 dark:ring-teal-400",
  system: "bg-muted text-muted-foreground ring-border border-dashed",
};

export type NoteView = Pick<Note, "id" | "content" | "authorType" | "createdAt" | "seq"> & { authorName?: string | null };

/**
 * Read-only notes thread, oldest first. Codes / phones inside the content are
 * masked by default (MaskedText). Server-renderable; MaskedText is the only
 * client island.
 */
export function NoteList({ notes, className, emptyText = "No notes yet." }: { notes: NoteView[]; className?: string; emptyText?: string }) {
  if (notes.length === 0) return <p className={cn("text-sm text-muted-foreground", className)}>{emptyText}</p>;
  return (
    <ol className={cn("space-y-3", className)}>
      {notes.map((n) => (
        <li key={n.id} className="flex gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium leading-none ring-1 ring-inset",
              AUTHOR_CLASS[n.authorType],
            )}
          >
            {AUTHOR_LABEL[n.authorType]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">
              {n.authorName ? <span className="font-medium text-foreground">{n.authorName} · </span> : null}
              {fmtDateTime(n.createdAt)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
              <MaskedText text={n.content} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
