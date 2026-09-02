import Link from "next/link";
import { AgentTag } from "@/components/atoms/agent-tag";
import { PriorityFlag } from "@/components/atoms/priority-flag";
import { StatusChip } from "@/components/atoms/status-chip";
import { Badge } from "@/components/atoms/ui/badge";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/atoms/ui/sheet";
import { sheetEndLabel, sheetWindowLabel } from "@/lib/ui/board-layout";
import type { JobSheetData } from "@/lib/ui/board-types";

export type JobSheetHeaderProps = { job: JobSheetData["job"] };

/** Sheet header: status / priority / source chips, customer, address, facts and page links. */
export function JobSheetHeader({ job }: JobSheetHeaderProps) {
  return (
    <SheetHeader className="border-b pr-12">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <StatusChip status={job.workStatus} />
        <PriorityFlag priority={job.priority} withLabel />
        {job.source === "agent" && <AgentTag />}
        {job.source === "office" && <Badge variant="outline">Office</Badge>}
        {job.invoiceNumber && <span className="ml-auto font-mono text-muted-foreground">#{job.invoiceNumber}</span>}
      </div>
      <SheetTitle className="mt-1">{job.customerName}</SheetTitle>
      <SheetDescription>{job.addressLabel ?? "No service address on file"}</SheetDescription>
      <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-xs text-muted-foreground">Window</dt>
        <dd className="font-medium">
          {sheetWindowLabel(job.scheduledStart, job.arrivalWindow)}
          {job.scheduledStart && job.scheduledEnd && <span className="ml-1 text-xs font-normal text-muted-foreground">(ends {sheetEndLabel(job.scheduledEnd)})</span>}
        </dd>
        <dt className="text-xs text-muted-foreground">Tech</dt>
        <dd className="font-medium">
          {job.techs.length > 0 && job.techs.map((t) => t.name).join(", ")}
          {job.techs.length === 0 && <span className="text-muted-foreground">Unassigned</span>}
        </dd>
        <dt className="text-xs text-muted-foreground">Work</dt>
        <dd>{job.description?.trim() || <span className="text-muted-foreground">No description</span>}</dd>
        {job.serviceType && (
          <>
            <dt className="text-xs text-muted-foreground">Service</dt>
            <dd className="capitalize">{job.serviceType}</dd>
          </>
        )}
        {job.tags.length > 0 && (
          <>
            <dt className="text-xs text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {job.tags.map((t) => (
                <Badge key={t} variant="secondary" className="h-4 px-1.5 text-xs">
                  {t}
                </Badge>
              ))}
            </dd>
          </>
        )}
        {job.outstandingBalance > 0 && (
          <>
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className="font-medium text-orange-700 dark:text-orange-400">${(job.outstandingBalance / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} outstanding</dd>
          </>
        )}
      </dl>
      <div className="mt-2 flex gap-3 text-sm">
        <Link href={`/jobs/${job.id}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Open job page
        </Link>
        <Link href={`/customers/${job.customerId}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Customer
        </Link>
      </div>
    </SheetHeader>
  );
}
