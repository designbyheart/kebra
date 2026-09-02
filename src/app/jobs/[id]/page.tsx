import { notFound } from "next/navigation";
import { PendingCancellationBanner } from "@/components/organisms/pending-cancellation-banner";
import { ActivityStrip } from "@/components/organisms/activity-strip";
import { JobActionsCard } from "@/components/organisms/job-actions-card";
import { JobDetailBody } from "@/components/organisms/job-detail-body";
import { JobHeader } from "@/components/organisms/job-header";
import { JobLiveRefresh } from "@/components/organisms/job-live-refresh";
import { DetailPage } from "@/components/templates/detail-page";
import { requireUser } from "@/lib/auth";
import { isoDateET } from "@/lib/time";
import { listServiceTypes, listTechOptions, loadJobPage, resolveJobId } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = await resolveJobId(id);
  const data = (jobId && (await loadJobPage(jobId))) || null;
  const title = (data && `Job #${data.job.invoiceNumber ?? ""} · ${data.customerName}`) || "Job";
  return { title };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const jobId = await resolveJobId(id);
  if (!jobId) notFound();
  const [data, serviceTypes, techs] = await Promise.all([loadJobPage(jobId), listServiceTypes(), listTechOptions()]);
  if (!data) notFound();
  const { job } = data;
  const primaryTech = data.techs[0] ?? null;
  const todayIso = isoDateET(new Date());

  return (
    <DetailPage stack live={<JobLiveRefresh jobId={job.id} />} back={{ href: "/jobs", label: "Jobs" }} header={<JobHeader data={data} />}>
      {data.pending && (
        <PendingCancellationBanner reason={data.pending.reason} requestedAt={data.pending.requestedAt} taskId={data.pending.taskId} callId={data.pending.callId} />
      )}
      <JobActionsCard
        jobId={job.id}
        addressId={job.addressId}
        status={job.workStatus}
        serviceType={job.serviceType}
        techId={primaryTech?.employee_id ?? null}
        serviceTypes={serviceTypes.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes }))}
        techs={techs}
        todayIso={todayIso}
        hasPendingRequest={Boolean(data.pending)}
      />
      <JobDetailBody data={data} />
      <ActivityStrip limit={12} className="mt-2" />
    </DetailPage>
  );
}
