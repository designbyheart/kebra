import type { JobPageData } from "@/app/jobs/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { JobTaskItem } from "@/components/molecules/job-task-item";

export type JobInboxItemsCardProps = { tasks: JobPageData["tasks"] };

/** Inbox tasks linked to this job. */
export function JobInboxItemsCard({ tasks }: JobInboxItemsCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Inbox items ({tasks.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length > 0 && (
          <ul className="space-y-2 text-sm">
            {tasks.map((t) => (
              <JobTaskItem key={t.id} task={t} />
            ))}
          </ul>
        )}
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">Nothing open for this job.</p>}
      </CardContent>
    </Card>
  );
}
