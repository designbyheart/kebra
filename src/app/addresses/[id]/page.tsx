import { notFound } from "next/navigation";
import { AccessNotes } from "@/components/organisms/access-notes";
import { ActivityStrip } from "@/components/organisms/activity-strip";
import { AddressHeader } from "@/components/organisms/address-header";
import { AddressIssues } from "@/components/organisms/address-issues";
import { EntityLiveRefresh } from "@/components/organisms/entity-live-refresh";
import { EquipmentPanel } from "@/components/organisms/equipment-panel";
import { SummaryCard } from "@/components/organisms/summary-card";
import { UpcomingCard } from "@/components/organisms/upcoming-card";
import { VisitsSection } from "@/components/organisms/visits-section";
import { WarrantyCard } from "@/components/organisms/warranty-card";
import { DossierPage } from "@/components/templates/dossier-page";
import { fallbackAddressSummary } from "@/lib/ui/dossier-summary";
import { isoDateET } from "@/lib/time";
import { getAddressPage } from "../queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getAddressPage(id);
  return { title: d?.dossier.address_label ?? "Address" };
}

export default async function AddressPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getAddressPage(id);
  if (!d) notFound();
  const { bundle, dossier, now } = d;
  const a = bundle.address;
  const c = bundle.customer;
  const highlight = (typeof sp.job === "string" && sp.job) || null;
  const isPM = d.sites_count > 1;
  const today = isoDateET(now);
  const tomorrow = isoDateET(new Date(now.getTime() + 86_400_000));
  const upcoming = dossier.upcoming.map((u) => ({ ...u, work_status: u.status }));
  const accessNotes = dossier.access_notes?.text ?? d.precomputed?.accessNotes ?? null;

  return (
    <DossierPage
      live={<EntityLiveRefresh addressId={a.id} customerId={c.id} jobIds={d.timeline.map((t) => t.job.id)} />}
      wrapCrumbs
      crumbs={[
        { href: "/customers", label: "Customers" },
        { href: `/customers/${c.id}`, label: c.displayName },
        { label: a.street },
      ]}
      header={
        <AddressHeader
          address={a}
          customer={c}
          dossier={dossier}
          isPM={isPM}
          sitesCount={d.sites_count}
          siblings={d.siblings}
          now={now}
          booking={{
            customerId: c.id,
            addressId: a.id,
            addressLabel: dossier.address_label,
            serviceTypes: d.serviceTypes,
            techs: d.techs,
            defaultDate: tomorrow,
            minDate: today,
          }}
        />
      }
      main={
        <>
          <SummaryCard
            title="Dossier"
            summary={d.precomputed?.summaryMd ?? null}
            fallback={fallbackAddressSummary(dossier, now)}
            generatedAt={d.precomputed?.generatedAt}
            model={d.precomputed?.model}
          />
          <AddressIssues openIssues={dossier.open_issue_details} recurring={dossier.recurring_issues} />
          <VisitsSection entries={d.timeline} now={now} highlightJobId={highlight} />
        </>
      }
      aside={
        <>
          <UpcomingCard items={upcoming} now={now} emptyText="Nothing on the books. Use Book a job." />
          <EquipmentPanel
            equipment={dossier.equipment}
            dossierEquipment={d.precomputed?.equipment}
            evidence={dossier.warranty.evidence}
            installJobId={dossier.warranty.install_job_id}
          />
          <WarrantyCard warranty={dossier.warranty} />
          <AccessNotes text={accessNotes} />
        </>
      }
      footer={<ActivityStrip limit={12} />}
    />
  );
}
