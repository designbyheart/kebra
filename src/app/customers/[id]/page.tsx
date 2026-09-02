import { notFound } from "next/navigation";
import { ActivityStrip } from "@/components/organisms/activity-strip";
import { CustomerHeader } from "@/components/organisms/customer-header";
import { EntityLiveRefresh } from "@/components/organisms/entity-live-refresh";
import { InvoicesCard } from "@/components/organisms/invoices-card";
import { PreferencesCard } from "@/components/organisms/preferences-card";
import { RecentCallsCard } from "@/components/organisms/recent-calls-card";
import { SitesCard } from "@/components/organisms/sites-card";
import { SummaryCard } from "@/components/organisms/summary-card";
import { UpcomingCard } from "@/components/organisms/upcoming-card";
import { DossierPage } from "@/components/templates/dossier-page";
import { fallbackCustomerSummary } from "@/lib/ui/dossier-summary";
import { getCustomerDetail } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getCustomerDetail(id);
  return { title: d?.customer.displayName ?? "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getCustomerDetail(id);
  if (!d) notFound();
  const { customer: c, now } = d;
  const prefs = Object.entries(d.dossier?.preferences ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  const fallbackSummary = fallbackCustomerSummary(c, d.sites.length, { total_cents: d.balance.total_cents, invoiceCount: d.balance.invoices.length });

  return (
    <DossierPage
      live={<EntityLiveRefresh customerId={c.id} jobIds={[...d.upcoming.map((u) => u.job_id), ...d.invoiceGroups.map((g) => g.job_id)]} />}
      crumbs={[{ href: "/customers", label: "Customers" }, { label: c.displayName }]}
      header={<CustomerHeader customer={c} sitesCount={d.sites.length} phones={d.phones} balance={d.balance} />}
      main={
        <>
          <SummaryCard summary={d.dossier?.summaryMd ?? null} fallback={fallbackSummary} generatedAt={d.dossier?.generatedAt} model={d.dossier?.model} />
          <SitesCard sites={d.sites} now={now} />
          <InvoicesCard groups={d.invoiceGroups} />
        </>
      }
      aside={
        <>
          <UpcomingCard items={d.upcoming} now={now} showAddress />
          <PreferencesCard prefs={prefs} />
          <RecentCallsCard calls={d.calls} />
        </>
      }
      footer={<ActivityStrip limit={12} />}
    />
  );
}
