import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/ui/card";
import { RecentCallItem } from "@/components/molecules/recent-call-item";
import type { CustomerDetail } from "@/app/customers/queries";

export type RecentCallsCardProps = { calls: CustomerDetail["calls"] };

/** The last calls matched to this customer. */
export function RecentCallsCard({ calls }: RecentCallsCardProps) {
  return (
    <Card size="sm">
      <CardHeader className="border-b pb-3">
        <CardTitle>Recent calls</CardTitle>
      </CardHeader>
      <CardContent>
        {calls.length === 0 && <p className="text-sm text-muted-foreground">No calls matched to this customer yet.</p>}
        {calls.length > 0 && (
          <ul className="divide-y">
            {calls.map((call) => (
              <RecentCallItem key={call.id} call={call} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
