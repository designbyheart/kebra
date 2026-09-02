import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityStrip } from "@/components/activity-strip";
import { AddNoteForm } from "@/components/jobs/add-note-form";
import { fmtDate, fmtDateTime, fmtWindow, money, relativeDay, visibleTags } from "@/components/jobs/format";
import { InvoiceDisclosure } from "@/components/jobs/invoice-lines";
import { JobActions } from "@/components/jobs/job-actions";
import { JobLiveRefresh } from "@/components/jobs/job-live-refresh";
import { NoteList } from "@/components/jobs/note-list";
import { PendingCancellationBanner } from "@/components/jobs/pending-cancellation-banner";
import { PriorityBadge, SourceBadge, StatusBadge, TagBadge, TaskStatusBadge } from "@/components/jobs/status-badge";
import { requireUser } from "@/lib/auth";
import { isoDateET } from "@/lib/time";
import { listServiceTypes, listTechOptions, loadJobPage, resolveJobId } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = await resolveJobId(id);
  const data = jobId ? await loadJobPage(jobId) : null;
  return { title: data ? `Job #${data.job.invoiceNumber ?? ""} · ${data.customerName}` : "Job" };
}

const KIND_LABEL: Record<string, string> = { callback: "Callback", handoff: "Handoff", review: "Review", followup: "Follow-up", cancellation: "Cancellation" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const jobId = await resolveJobId(id);
  if (!jobId) notFound();
  const [data, serviceTypes, techs] = await Promise.all([loadJobPage(jobId), listServiceTypes(), listTechOptions()]);
  if (!data) notFound();
  const { job } = data;
  const tags = visibleTags(job.tags);
  const primaryTech = data.techs[0] ?? null;
  const todayIso = isoDateET(new Date());

  return (
    <div className="space-y-4">
      <JobLiveRefresh jobId={job.id} />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/jobs" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Jobs
        </Link>
      </div>

      <header className="border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{job.description?.trim() || "Service visit"}</h1>
          {job.invoiceNumber ? <span className="text-lg text-muted-foreground">#{job.invoiceNumber}</span> : null}
          <StatusBadge status={job.workStatus} className="h-6 px-2 text-xs" />
          <PriorityBadge priority={job.priority} className="h-6 px-2 text-xs" />
          <SourceBadge source={job.source} className="h-6 px-2 text-xs" />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <Fact label="Window">
            {fmtWindow(job.scheduledStart, data.windowEnd)}
            {job.scheduledStart ? <span className="ml-1 text-xs text-muted-foreground">({relativeDay(job.scheduledStart)})</span> : null}
          </Fact>
          <Fact label="Tech">{data.techs.length ? data.techs.map((t) => t.name).join(", ") : <span className="text-muted-foreground">Unassigned</span>}</Fact>
          <Fact label="Customer">
            <Link href={`/customers/${job.customerId}`} className="hover:underline">
              {data.customerName}
            </Link>
            {data.customerKind ? <span className="ml-1 text-xs text-muted-foreground">({data.customerKind})</span> : null}
          </Fact>
          <Fact label="Address">
            {job.addressId ? (
              <Link href={`/addresses/${job.addressId}`} className="hover:underline">
                {data.addressLabel}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Fact>
          <Fact label="Arrival window">{job.arrivalWindow ? `${job.arrivalWindow} min` : "—"}</Fact>
          <Fact label="Total">{money(job.totalAmount)}</Fact>
          <Fact label="Outstanding">
            {job.outstandingBalance > 0 ? <span className="font-medium text-red-700 dark:text-red-300">{money(job.outstandingBalance)}</span> : <span className="text-muted-foreground">Paid</span>}
          </Fact>
          <Fact label="Timeline">
            <span className="text-xs text-muted-foreground">
              {job.startedAt ? `Started ${fmtDateTime(job.startedAt)}` : job.completedAt ? `Completed ${fmtDate(job.completedAt)}` : job.canceledAt ? `Canceled ${fmtDate(job.canceledAt)}` : `Created ${fmtDate(job.createdAt)}`}
            </span>
          </Fact>
        </dl>
        {tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.map((t) => (
              <TagBadge key={t} tag={t} />
            ))}
          </div>
        ) : null}
      </header>

      {data.pending ? (
        <PendingCancellationBanner reason={data.pending.reason} requestedAt={data.pending.requestedAt} taskId={data.pending.taskId} callId={data.pending.callId} />
      ) : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <JobActions
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
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Notes ({data.notes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <NoteList notes={data.notes} />
            <div className="border-t pt-3">
              <AddNoteForm jobId={job.id} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Invoices ({data.invoices.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.invoices.length ? (
                data.invoices.map((inv, i) => <InvoiceDisclosure key={inv.id} invoice={inv} defaultOpen={i === 0} />)
              ) : (
                <p className="text-sm text-muted-foreground">No invoice on file.</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Inbox items ({data.tasks.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {data.tasks.length ? (
                <ul className="space-y-2 text-sm">
                  {data.tasks.map((t) => (
                    <li key={t.id} className="flex items-start gap-2">
                      <TaskStatusBadge status={t.status} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/inbox?task=${encodeURIComponent(t.id)}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {KIND_LABEL[t.kind] ?? t.kind}
                          {t.assignedName ? ` · ${t.assignedName}` : ""}
                          {t.dueAt ? ` · due ${relativeDay(t.dueAt)}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing open for this job.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <ActivityStrip limit={12} className="mt-2" />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}
