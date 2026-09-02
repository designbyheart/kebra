import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { UpcomingJobs, type UpcomingJobsProps } from "@/components/organisms/upcoming-jobs";

export type UpcomingCardProps = UpcomingJobsProps;

/** "Upcoming" card in the dossier aside (customer and address pages). */
export function UpcomingCard(props: UpcomingCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Upcoming</CardTitle>
      </CardHeader>
      <CardContent>
        <UpcomingJobs {...props} />
      </CardContent>
    </Card>
  );
}
