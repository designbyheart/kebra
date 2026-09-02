import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityStrip } from "@/components/activity-strip";
import { KindPill } from "@/components/customers/customers-table";
import { EntityLiveRefresh } from "@/components/customers/entity-live-refresh";
import { SummaryCard } from "@/components/customers/summary-card";
import { UpcomingJobs } from "@/components/customers/upcoming-jobs";
import { InvoiceDisclosure } from "@/components/jobs/invoice-lines";
import { fmtDate, fmtDateTime, money, pluralize, relativeDay } from "@/components/jobs/format";
import { getCustomerDetail } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getCustomerDetail(id);
  return { title: d ? d.customer.displayName : "Customer" };
}

function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getCustomerDetail(id);
  if (!d) notFound();
  const { customer: c, now } = d;
  const prefs = Object.entries(d.dossier?.preferences ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  const fallbackSummary = [
    `${c.displayName} is a ${c.kind === "business" || c.company ? "business" : "homeowner"} customer with ${pluralize(d.sites.length, "service address", "service addresses")} and ${pluralize(c.jobCount, "job")} on file`,
    c.firstJob ? `since ${fmtDate(c.firstJob)}` : null,
    c.lastJob ? `, last on ${fmtDate(c.lastJob)}` : null,
    ".",
    d.balance.total_cents > 0 ? ` Open balance ${money(d.balance.total_cents)} across ${pluralize(d.balance.invoices.length, "invoice")}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".");

  return (
    <div className="space-y-6">
      <EntityLiveRefresh customerId={c.id} jobIds={[...d.upcoming.map((u) => u.job_id), ...d.invoiceGroups.map((g) => g.job_id)]} />
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/customers" className="hover:underline">
          Customers
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{c.displayName}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{c.displayName}</h1>
            <KindPill kind={c.kind} company={c.company} />
            {c.company && c.company !== c.displayName ? <span className="text-sm text-muted-foreground">{c.company}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{pluralize(d.sites.length, "site")}</span>
            <span>{pluralize(c.jobCount, "job")}</span>
            <span>Customer since {fmtDate(c.firstJob ?? c.createdAt)}</span>
            {d.phones.length ? (
              <span className="flex flex-wrap items-center gap-2">
                {d.phones.map((p) => (
                  <a key={p.id} href={`tel:${p.phone}`} className="inline-flex items-center gap-1 tabular-nums hover:underline" title={`${p.label ?? "phone"} · ${p.source}`}>
                    <Phone className="size-3" />
                    {formatPhone(p.phone)}
                    {p.source === "agent" ? <span className="rounded bg-teal-600 px-1 text-[10px] font-medium text-white">Agent</span> : null}
                  </a>
                ))}
              </span>
            ) : (
              <span>No phone on file</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Open balance</div>
          <div className={`text-xl font-semibold tabular-nums ${d.balance.total_cents > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{money(d.balance.total_cents)}</div>
          {d.balance.invoices.length ? <div className="text-xs text-muted-foreground">{pluralize(d.balance.invoices.length, "open invoice")}</div> : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SummaryCard summary={d.dossier?.summaryMd ?? null} fallback={fallbackSummary} generatedAt={d.dossier?.generatedAt} model={d.dossier?.model} />

          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Sites ({d.sites.length})</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-3">Address</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead>Last visit</TableHead>
                    <TableHead>Next</TableHead>
                    <TableHead className="pr-3 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.sites.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-3">
                        <Link href={`/addresses/${s.id}`} className="font-medium hover:underline">
                          {s.label}
                        </Link>
                        {s.zip ? <span className="ml-2 text-xs text-muted-foreground">{s.zip}</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.job_count}</TableCell>
                      <TableCell className="text-muted-foreground">{relativeDay(s.last_visit_at, now)}</TableCell>
                      <TableCell className="text-muted-foreground">{s.next_visit_at ? relativeDay(s.next_visit_at, now) : "—"}</TableCell>
                      <TableCell className={`pr-3 text-right tabular-nums ${s.open_balance_cents > 0 ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
                        {money(s.open_balance_cents, { dash: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.invoiceGroups.length === 0 ? <p className="text-sm text-muted-foreground">No invoices on file.</p> : null}
              {d.invoiceGroups.map((g) => (
                <div key={g.job_id} className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
                    <Link href={`/jobs/${g.job_id}`} className="font-medium text-foreground hover:underline">
                      {g.description ?? "Visit"}
                    </Link>
                    <span>{fmtDate(g.visit_date)}</span>
                    {g.address_label ? <span className="truncate">{g.address_label}</span> : null}
                  </div>
                  {g.invoices.map((inv) => (
                    <InvoiceDisclosure key={inv.id} invoice={inv} />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <UpcomingJobs items={d.upcoming} now={now} showAddress />
            </CardContent>
          </Card>

          {prefs.length ? (
            <Card size="sm">
              <CardHeader className="border-b pb-3">
                <CardTitle className="text-sm">Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-1.5 text-sm">
                  {prefs.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-28 shrink-0 text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="min-w-0">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card size="sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm">Recent calls</CardTitle>
            </CardHeader>
            <CardContent>
              {d.calls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls matched to this customer yet.</p>
              ) : (
                <ul className="divide-y">
                  {d.calls.map((call) => (
                    <li key={call.id} className="py-2 first:pt-0 last:pb-0">
                      <Link href={`/calls/${call.id}`} className="flex flex-wrap items-baseline gap-x-2 text-sm hover:underline">
                        <span className="font-medium">{fmtDateTime(call.startedAt)}</span>
                        <span className="text-xs text-muted-foreground">
                          {call.direction} · {call.status}
                          {call.outcome ? ` · ${call.outcome}` : ""}
                        </span>
                        {call.needsReview ? <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">needs review</span> : null}
                      </Link>
                      {call.summary ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{call.summary}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <ActivityStrip limit={12} />
    </div>
  );
}
