import { PageHeader } from "@/components/page-header";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobsTable } from "@/components/jobs/jobs-table";
import { parseJobFilters, type RawSearchParams } from "@/components/jobs/job-filter-params";
import { requireUser } from "@/lib/auth";
import { isoDateET } from "@/lib/time";
import { JOB_LIST_LIMIT, listJobs, listTagOptions, listTechOptions } from "./queries";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const today = isoDateET(new Date());
  const filters = parseJobFilters(sp, today);
  const [list, techs, tags] = await Promise.all([listJobs(filters, today), listTechOptions(), listTagOptions()]);

  const rangeText = filters.from && filters.to ? `${filters.from} → ${filters.to}` : filters.from ? `from ${filters.from}` : filters.to ? `through ${filters.to}` : "all dates";

  return (
    <div className="space-y-4">
      <PageHeader title="Jobs" description="All jobs, past and upcoming. Every change here uses the same functions the phone agent does." />
      <JobFilters filters={filters} techs={techs} tags={tags} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {Math.min(list.rows.length, JOB_LIST_LIMIT)} of {list.total} · {rangeText} · {list.direction === "asc" ? "soonest first" : "latest first"}
        </span>
        {list.total > JOB_LIST_LIMIT ? <span>Narrow the filters to see the rest.</span> : null}
      </div>
      <JobsTable rows={list.rows} />
    </div>
  );
}
