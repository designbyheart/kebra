import Link from "next/link";
import type { JobPageData } from "@/app/jobs/queries";
import { Fact } from "@/components/atoms/fact";
import { PriorityBadge } from "@/components/atoms/priority-badge";
import { SourceBadge } from "@/components/atoms/source-badge";
import { StatusBadge } from "@/components/atoms/status-badge";
import { TagBadge } from "@/components/atoms/tag-badge";
import { fmtWindow, money, relativeDay, visibleTags } from "@/lib/ui/format";
import { arrivalWindowLabel, jobTimelineLabel } from "@/lib/ui/job-status";

export type JobHeaderProps = { data: JobPageData };

/** Title, badges, the fact grid and tags at the top of the job page. */
export function JobHeader({ data }: JobHeaderProps) {
  const { job } = data;
  const tags = visibleTags(job.tags);
  return (
    <header className="border-b pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{job.description?.trim() || "Service visit"}</h1>
        {job.invoiceNumber && <span className="text-lg text-muted-foreground">#{job.invoiceNumber}</span>}
        <StatusBadge status={job.workStatus} className="h-6 px-2 text-xs" />
        <PriorityBadge priority={job.priority} className="h-6 px-2 text-xs" />
        <SourceBadge source={job.source} className="h-6 px-2 text-xs" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        <Fact label="Window">
          {fmtWindow(job.scheduledStart, data.windowEnd)}
          {job.scheduledStart && <span className="ml-1 text-xs text-muted-foreground">({relativeDay(job.scheduledStart)})</span>}
        </Fact>
        <Fact label="Tech">
          {data.techs.length > 0 && data.techs.map((t) => t.name).join(", ")}
          {data.techs.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
        </Fact>
        <Fact label="Customer">
          <Link href={`/customers/${job.customerId}`} className="hover:underline">
            {data.customerName}
          </Link>
          {data.customerKind && <span className="ml-1 text-xs text-muted-foreground">({data.customerKind})</span>}
        </Fact>
        <Fact label="Address">
          {job.addressId && (
            <Link href={`/addresses/${job.addressId}`} className="hover:underline">
              {data.addressLabel}
            </Link>
          )}
          {!job.addressId && <span className="text-muted-foreground">—</span>}
        </Fact>
        <Fact label="Arrival window">{arrivalWindowLabel(job.arrivalWindow)}</Fact>
        <Fact label="Total">{money(job.totalAmount)}</Fact>
        <Fact label="Outstanding">
          {job.outstandingBalance > 0 && <span className="font-medium text-red-700 dark:text-red-300">{money(job.outstandingBalance)}</span>}
          {job.outstandingBalance <= 0 && <span className="text-muted-foreground">Paid</span>}
        </Fact>
        <Fact label="Timeline">
          <span className="text-xs text-muted-foreground">{jobTimelineLabel(job)}</span>
        </Fact>
      </dl>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </div>
      )}
    </header>
  );
}
