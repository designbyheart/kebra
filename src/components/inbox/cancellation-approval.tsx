/**
 * Cancellation approval card (W2-E, PLAN §3 D12). Server component.
 *
 * Usage from /inbox (W2-D):
 *   <CancellationApprovalCard changeRequestId={cr.id} />
 *   <CancellationApprovalCard data={await loadCancellationApproval(id)} />
 *
 * Shows the job, the reason the agent recorded, the transcript passage where
 * the caller asked to cancel (3 turns of context, request highlighted), links
 * to the full call and the recording, and — for admins only — approve /
 * reject buttons backed by the server actions in `src/app/inbox/actions.ts`.
 */
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { formatDateTimeET, formatWindow } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CancellationActions } from "./cancellation-actions";
import { loadCancellationApproval, type CancellationApprovalData, type ExcerptTurn } from "./cancellation-data";
import { canResolveCancellations } from "./cancellation-resolve";
import { PendingCancellationBadge } from "./pending-badge";

export type { CancellationApprovalData } from "./cancellation-data";

export type CancellationApprovalCardProps = (
  | { changeRequestId: string; data?: undefined }
  | { data: CancellationApprovalData; changeRequestId?: undefined }
) & {
  /** Pass the session user when the page already has it; otherwise the card looks it up. */
  viewer?: CurrentUser | null;
  className?: string;
};

export async function CancellationApprovalCard(props: CancellationApprovalCardProps) {
  const data = props.data ?? (await loadCancellationApproval(props.changeRequestId));
  if (!data) {
    return (
      <Card size="sm" className={props.className}>
        <CardContent className="text-sm text-muted-foreground">This cancellation request no longer exists.</CardContent>
      </Card>
    );
  }
  const viewer = props.viewer === undefined ? await getCurrentUser() : props.viewer;
  return <CancellationApprovalCardView data={data} viewer={viewer} className={props.className} />;
}

/** Pure view; exported for tests and for callers that already resolved everything. */
export function CancellationApprovalCardView({
  data,
  viewer,
  className,
}: {
  data: CancellationApprovalData;
  viewer: CurrentUser | null;
  className?: string;
}) {
  const { job, call } = data;
  const admin = canResolveCancellations(viewer);
  const windowLabel = job.scheduledStart ? formatWindow(job.scheduledStart, job.scheduledEnd ?? job.scheduledStart) : null;
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
          {data.status === "pending" ? <PendingCancellationBadge /> : <ResolvedBadge status={data.status} />}
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
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Job">
            <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
              {job.invoiceNumber ? `#${job.invoiceNumber}` : job.id}
            </Link>
          </Fact>
          <Fact label="Window">{windowLabel ?? <span className="text-muted-foreground">Needs scheduling</span>}</Fact>
          <Fact label="Tech">{job.techNames.length ? job.techNames.join(", ") : <span className="text-muted-foreground">Unassigned</span>}</Fact>
          <Fact label="Customer">{job.customerName}</Fact>
          <Fact label="Address" className="col-span-2">
            {job.addressLabel ?? <span className="text-muted-foreground">No address on job</span>}
          </Fact>
          {job.description ? (
            <Fact label="Description" className="col-span-full">
              <span className="line-clamp-2 text-muted-foreground">{job.description}</span>
            </Fact>
          ) : null}
        </dl>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <section>
          <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Reason recorded by the agent</h4>
          <p className="rounded-md border border-l-2 border-l-red-500 bg-muted/40 px-3 py-2 text-sm">
            {data.reason?.trim() || <span className="text-muted-foreground">No reason recorded.</span>}
          </p>
        </section>

        <section>
          <div className="mb-1 flex items-center gap-3">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Where the caller asked</h4>
            {call ? (
              <span className="ml-auto flex items-center gap-3 text-xs">
                <Link href={`/calls/${call.id}`} className="font-medium text-primary hover:underline">
                  Full call →
                </Link>
                {call.recordingUrl ? (
                  <a href={call.recordingUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-primary hover:underline">
                    Recording ↗
                  </a>
                ) : (
                  <span className="text-muted-foreground">No recording</span>
                )}
                {call.callerNumberMasked ? <span className="text-muted-foreground">{call.callerNumberMasked}</span> : null}
              </span>
            ) : null}
          </div>
          <TranscriptExcerpt excerpt={data.excerpt} hasCall={!!call} turnCount={call?.turnCount ?? 0} />
        </section>

        {!pending ? (
          <p className="text-xs text-muted-foreground">
            {data.status === "approved" ? "Approved" : "Rejected"} by {data.resolvedByName ?? "office"}
            {data.resolvedAt ? ` · ${formatDateTimeET(data.resolvedAt)}` : ""}
            {data.resolutionNote ? ` · “${data.resolutionNote}”` : ""}
            {data.status === "rejected" && data.previousStatus ? ` · status restored to ${data.previousStatus}` : ""}
          </p>
        ) : null}
      </CardContent>

      {pending ? (
        <CardFooter className="gap-3">
          {admin ? (
            <CancellationActions changeRequestId={data.id} customerName={job.customerName} windowLabel={windowLabel} />
          ) : (
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium">Awaiting admin approval</span>
              <span className="text-muted-foreground">
                {data.approvers.length ? `Can approve: ${data.approvers.join(", ")}` : "No admin users are set up yet."}
              </span>
            </div>
          )}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function ResolvedBadge({ status }: { status: "approved" | "rejected" }) {
  return status === "approved" ? (
    <Badge variant="secondary" className="bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      Canceled
    </Badge>
  ) : (
    <Badge variant="outline">Kept on the books</Badge>
  );
}

const ROLE_LABEL: Record<ExcerptTurn["role"], string> = {
  user: "Caller",
  assistant: "Agent",
  system: "System",
  tool: "Tool",
};

/** `t` is seconds into the call (W2-A); tolerate epoch millis from older rows. */
function formatOffset(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "";
  if (t > 1e12) return formatDateTimeET(t).split(", ").pop() ?? "";
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TranscriptExcerpt({ excerpt, hasCall, turnCount }: { excerpt: ExcerptTurn[]; hasCall: boolean; turnCount: number }) {
  if (!hasCall) {
    return <p className="text-xs text-muted-foreground">Requested outside a recorded call (no transcript to show).</p>;
  }
  if (!excerpt.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {turnCount ? "No transcript reference was recorded for this request." : "Transcript not available yet."}
      </p>
    );
  }
  const first = excerpt[0].index;
  return (
    <ol className="divide-y overflow-hidden rounded-md border text-sm">
      {first > 0 ? <li className="px-3 py-1 text-[11px] text-muted-foreground">… {first} earlier turn{first === 1 ? "" : "s"}</li> : null}
      {excerpt.map((t) => (
        <li
          key={t.index}
          data-highlight={t.highlight || undefined}
          className={cn(
            "grid grid-cols-[3.5rem_2.5rem_1fr] items-baseline gap-2 px-3 py-1.5",
            t.highlight && "border-l-2 border-l-red-500 bg-red-500/8 dark:bg-red-400/10",
          )}
        >
          <span
            className={cn(
              "text-[11px] font-medium uppercase",
              t.role === "assistant" ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground",
            )}
          >
            {ROLE_LABEL[t.role] ?? t.role}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{formatOffset(t.t)}</span>
          <span className={cn(t.highlight && "font-medium")}>{t.text}</span>
        </li>
      ))}
    </ol>
  );
}
