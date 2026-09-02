import { JobsResultSummary } from "@/components/organisms/jobs-result-summary";
import { JobFilters } from "@/components/organisms/job-filters";
import { JobsTable } from "@/components/organisms/jobs-table";
import { ListPage } from "@/components/templates/list-page";
import { requireUser } from "@/lib/auth";
import { isoDateET } from "@/lib/time";
import { parseJobFilters, type RawSearchParams } from "@/lib/ui/job-filter-params";
import { JOB_LIST_LIMIT, listJobs, listTagOptions, listTechOptions } from "./queries";

export const metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const today = isoDateET(new Date());
  const filters = parseJobFilters(sp, today);
  const [list, techs, tags] = await Promise.all([listJobs(filters, today), listTechOptions(), listTagOptions()]);

  return (
    <ListPage stack title="Jobs" description="All jobs, past and upcoming. Every change here uses the same functions the phone agent does.">
      <JobFilters filters={filters} techs={techs} tags={tags} />
      <JobsResultSummary shown={list.rows.length} total={list.total} limit={JOB_LIST_LIMIT} filters={filters} direction={list.direction} />
      <JobsTable rows={list.rows} />
    </ListPage>
  );
}
