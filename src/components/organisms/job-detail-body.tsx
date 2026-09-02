import type { JobPageData } from "@/app/jobs/queries";
import { JobInboxItemsCard } from "@/components/organisms/job-inbox-items-card";
import { JobInvoicesCard } from "@/components/organisms/job-invoices-card";
import { JobNotesCard } from "@/components/organisms/job-notes-card";

export type JobDetailBodyProps = { data: JobPageData };

/** Two-column body of the job page: notes on the left, invoices + inbox items on the right. */
export function JobDetailBody({ data }: JobDetailBodyProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <JobNotesCard jobId={data.job.id} notes={data.notes} />
      <div className="space-y-4">
        <JobInvoicesCard invoices={data.invoices} />
        <JobInboxItemsCard tasks={data.tasks} />
      </div>
    </div>
  );
}
