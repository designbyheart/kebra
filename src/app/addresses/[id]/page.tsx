import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityStrip } from "@/components/activity-strip";
import { BookJobDialog } from "@/components/customers/book-job-dialog";
import { EntityLiveRefresh } from "@/components/customers/entity-live-refresh";
import { KindPill } from "@/components/customers/customers-table";
import { EquipmentPanel } from "@/components/customers/equipment-panel";
import { SummaryCard } from "@/components/customers/summary-card";
import { UpcomingJobs } from "@/components/customers/upcoming-jobs";
import { VisitTimeline } from "@/components/customers/visit-timeline";
import { WarrantyPillWithBasis } from "@/components/customers/warranty-pill";
import { MaskedBlock } from "@/components/jobs/masked-text";
import { fmtDate, money, pluralize, relativeDay, unitLabel } from "@/components/jobs/format";
import { fallbackAddressSummary } from "@/components/customers/dossier-summary";
import { isoDateET } from "@/lib/time";
import { getAddressPage } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getAddressPage(id);
  return { title: d ? d.dossier.address_label : "Address" };
}

export default async function AddressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getAddressPage(id);
  if (!d) notFound();
  const { bundle, dossier, now } = d;
  const a = bundle.address;
  const c = bundle.customer;
  const highlight = typeof sp.job === "string" ? sp.job : null;
  const unit = unitLabel(a.unit);
  const isPM = d.sites_count > 1;
  const today = isoDateET(now);
  const tomorrow = isoDateET(new Date(now.getTime() + 86_400_000));
  const upcoming = dossier.upcoming.map((u) => ({ ...u, work_status: u.status }));

  return (
    <div className="space-y-6">
      <EntityLiveRefresh addressId={a.id} customerId={c.id} jobIds={d.timeline.map((t) => t.job.id)} />
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/customers" className="hover:underline">
          Customers
        </Link>
        <ChevronRight className="size-3" />
        <Link href={`/customers/${c.id}`} className="hover:underline">
          {c.displayName}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{a.street}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {a.street}
              {unit ? <span className="text-muted-foreground"> · {unit}</span> : null}
            </h1>
            <WarrantyPillWithBasis warranty={dossier.warranty} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {[a.city, a.state, a.zip].filter(Boolean).join(", ")}
            </span>
            <span className="flex items-center gap-1.5">
              <Link href={`/customers/${c.id}`} className="font-medium text-foreground hover:underline">
                {c.displayName}
              </Link>
              <KindPill kind={c.kind} company={c.company} />
              {isPM ? (
                <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900">
                  Property manager · {pluralize(d.sites_count, "site")}
                </span>
              ) : null}
            </span>
            <span>
              Last visit {dossier.last_visit ? relativeDay(dossier.last_visit.date, now) : "none"} · {pluralize(dossier.visit_count_12m, "visit")} in 12 mo
            </span>
            {dossier.open_balance_cents > 0 ? (
              <span className="font-medium text-red-700 dark:text-red-300">
                {money(dossier.open_balance_cents)} open across {pluralize(dossier.open_balance_jobs, "job")}
              </span>
            ) : null}
          </div>
          {d.siblings.length ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>Other units here:</span>
              {d.siblings.map((s) => (
                <Link key={s.id} href={`/addresses/${s.id}`} className="rounded-md border px-1.5 py-0.5 hover:bg-muted">
                  {s.unit ?? "(no unit)"}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <BookJobDialog
          customerId={c.id}
          addressId={a.id}
          addressLabel={dossier.address_label}
          serviceTypes={d.serviceTypes}
          techs={d.techs}
          defaultDate={tomorrow}
          minDate={today}
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SummaryCard
            title="Dossier"
            summary={d.precomputed?.summaryMd ?? null}
            fallback={fallbackAddressSummary(dossier, now)}
            generatedAt={d.precomputed?.generatedAt}
            model={d.precomputed?.model}
          />

          {dossier.open_issue_details.length || dossier.recurring_issues.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card size="sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <AlertTriangle className="size-3.5 text-amber-600" />
                    Open issues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dossier.open_issue_details.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing waiting on us.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {dossier.open_issue_details.map((o, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                          <span>
                            {o.text}{" "}
                            <Link href={`/jobs/${o.job_id}`} className="text-xs text-muted-foreground hover:underline">
                              open job
                            </Link>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader className="border-b pb-3">
                  <CardTitle className="flex items-center gap-1.5 text-sm">
                    <Repeat className="size-3.5 text-muted-foreground" />
                    Recurring
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dossier.recurring_issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No repeat work in the last 12 months.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {dossier.recurring_issues.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Visits <span className="font-normal normal-case">· {d.timeline.length} jobs, newest first · click a row for notes and invoice lines</span>
            </h2>
            <VisitTimeline entries={d.timeline} now={now} highlightJobId={highlight} />
          </section>
        </div>

        <div className="space-y-6">
          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingJobs items={upcoming} now={now} emptyText="Nothing on the books. Use Book a job." />
            </CardContent>
          </Card>

          <EquipmentPanel
            equipment={dossier.equipment}
            dossierEquipment={d.precomputed?.equipment}
            evidence={dossier.warranty.evidence}
            installJobId={dossier.warranty.install_job_id}
          />

          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Warranty</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Labor · {dossier.warranty.labor.covered ? `covered to ${fmtDate(dossier.warranty.labor.until)}` : "not covered"}</div>
                <p className="leading-relaxed">{dossier.warranty.labor.basis}</p>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">
                  Parts ·{" "}
                  {dossier.warranty.parts.covered === true
                    ? `covered to ${fmtDate(dossier.warranty.parts.until)}`
                    : dossier.warranty.parts.covered === "likely"
                      ? `likely to ${dossier.warranty.parts.until ? fmtDate(dossier.warranty.parts.until) : "—"}`
                      : "not covered"}
                </div>
                <p className="leading-relaxed">{dossier.warranty.parts.basis}</p>
              </div>
              <p className="text-xs text-muted-foreground">{dossier.warranty.caveat}</p>
            </CardContent>
          </Card>

          {dossier.access_notes ? (
            <MaskedBlock text={dossier.access_notes.text} label="Access notes · masked" />
          ) : d.precomputed?.accessNotes ? (
            <MaskedBlock text={d.precomputed.accessNotes} label="Access notes · masked" />
          ) : null}
        </div>
      </div>
      <ActivityStrip limit={12} />
    </div>
  );
}
