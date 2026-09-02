import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import type { CancellationApprovalData } from "@/app/inbox/cancellation-data";
import { canResolveCancellations } from "@/app/inbox/cancellation-resolve";
import { Fact } from "@/components/atoms/fact";
import { PendingCancellationBadge } from "@/components/atoms/pending-cancellation-badge";
import { ResolvedBadge } from "@/components/atoms/resolved-badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/atoms/ui/card";
import { AwaitingApprovalNote } from "@/components/molecules/awaiting-approval-note";
import { CancellationCallLinks } from "@/components/molecules/cancellation-call-links";
import { CancellationTranscriptExcerpt } from "@/components/molecules/cancellation-transcript-excerpt";
import { CancellationActions } from "@/components/organisms/cancellation-actions";
import type { CurrentUser } from "@/lib/auth";
import { formatDateTimeET, formatWindow } from "@/lib/time";
import { resolutionLine } from "@/lib/ui/inbox-grouping";
import { cn } from "@/lib/utils";

export type CancellationApprovalCardViewProps = {
  data: CancellationApprovalData;
  viewer: CurrentUser | null;
  className?: string;
};

/**
 * Pure view of one cancellation request: the job, the reason the agent
 * recorded, the transcript passage where the caller asked to cancel, links to
 * the call and recording, and — for admins only — approve / reject.
 * Exported for tests and for callers that already resolved everything.
 */
export function CancellationApprovalCardView({ data, viewer, className }: CancellationApprovalCardViewProps) {
  const { job, call } = data;
  const admin = canResolveCancellations(viewer);
  const windowLabel = job.scheduledStart && formatWindow(job.scheduledStart, job.scheduledEnd ?? job.scheduledStart);
  const pending = data.status === "pending";

  return (
    <Card
      size="sm"
      data-change-request-id={data.id}
      data-status={data.status}
      className={cn("ring-red-500/25 dark:ring-red-400/25", !pending && "ring-foreground/10", className)}
    >
      <CardHeader className="gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {pending && <PendingCancellationBadge />}
          {data.status !== "pending" && <ResolvedBadge status={data.status} />}
          <span className="text-sm font-medium">
            Cancellation request ·{" "}
            <Link href={`/customers/${job.customerId}`} className="hover:underline">
              {job.customerName}
            </Link>
          </span>
          <span className="ml-auto text-xs text-muted-foreground" title={formatDateTimeET(data.requestedAt)}>
            Requested {formatDistanceToNowStrict(data.requestedAt, { addSuffix: true })} · {formatDateTimeET(data.requestedAt)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Fact variant="plain" label="Job">
            <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
              {(job.invoiceNumber && `#${job.invoiceNumber}`) || job.id}
            </Link>
          </Fact>
          <Fact variant="plain" label="Window">
            {windowLabel ?? <span className="text-muted-foreground">Needs scheduling</span>}
          </Fact>
          <Fact variant="plain" label="Tech">
            {job.techNames.length > 0 && job.techNames.join(", ")}
            {job.techNames.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
          </Fact>
          <Fact variant="plain" label="Customer">
            {job.customerName}
          </Fact>
          <Fact variant="plain" label="Address" className="col-span-2">
            {job.addressLabel ?? <span className="text-muted-foreground">No address on job</span>}
          </Fact>
          {job.description && (
            <Fact variant="plain" label="Description" className="col-span-full">
              <span className="line-clamp-2 text-muted-foreground">{job.description}</span>
            </Fact>
          )}
        </dl>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <section>
          <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Reason recorded by the agent</div>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {data.reason?.trim() || <span className="text-muted-foreground">No reason recorded.</span>}
          </p>
        </section>

        <section>
          <div className="mb-1 flex items-center gap-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Where the caller asked</div>
            {call && <CancellationCallLinks callId={call.id} recordingUrl={call.recordingUrl} callerNumberMasked={call.callerNumberMasked} />}
          </div>
          <CancellationTranscriptExcerpt excerpt={data.excerpt} hasCall={Boolean(call)} turnCount={call?.turnCount ?? 0} />
        </section>

        {!pending && <p className="text-xs text-muted-foreground">{resolutionLine(data)}</p>}
      </CardContent>

      {pending && (
        <CardFooter className="gap-3">
          {admin && <CancellationActions changeRequestId={data.id} customerName={job.customerName} windowLabel={windowLabel} />}
          {!admin && <AwaitingApprovalNote approvers={data.approvers} />}
        </CardFooter>
      )}
    </Card>
  );
}
