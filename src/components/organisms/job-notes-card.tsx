import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { AddNoteForm } from "@/components/organisms/add-note-form";
import { NoteList } from "@/components/organisms/note-list";
import type { NoteView } from "@/lib/ui/note-view";

export type JobNotesCardProps = { jobId: string; notes: NoteView[] };

/** Notes thread plus the add-note form. */
export function JobNotesCard({ jobId, notes }: JobNotesCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notes ({notes.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <NoteList notes={notes} />
        <div className="border-t pt-3">
          <AddNoteForm jobId={jobId} />
        </div>
      </CardContent>
    </Card>
  );
}
