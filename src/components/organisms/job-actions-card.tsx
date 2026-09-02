import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { JobActions, type JobActionsProps } from "@/components/organisms/job-actions";

export type JobActionsCardProps = JobActionsProps;

/** "Actions" card on the job page wrapping the office controls. */
export function JobActionsCard(props: JobActionsCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <JobActions {...props} />
      </CardContent>
    </Card>
  );
}
