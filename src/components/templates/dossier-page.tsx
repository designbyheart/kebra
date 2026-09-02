import { Breadcrumbs, type BreadcrumbItem } from "@/components/molecules/breadcrumbs";

export type DossierPageProps = {
  /** Render-nothing islands (live refresh) mounted first. */
  live?: React.ReactNode;
  crumbs: BreadcrumbItem[];
  /** Let the trail wrap onto a second line (address page). */
  wrapCrumbs?: boolean;
  header: React.ReactNode;
  /** Two-thirds column. */
  main: React.ReactNode;
  /** One-third column. */
  aside: React.ReactNode;
  /** Full-width footer (the activity strip). */
  footer?: React.ReactNode;
};

/** Customer and address dossiers: breadcrumb, header, 2/1 grid, activity. */
export function DossierPage({ live, crumbs, wrapCrumbs = false, header, main, aside, footer }: DossierPageProps) {
  return (
    <div className="space-y-6">
      {live}
      <Breadcrumbs items={crumbs} wrap={wrapCrumbs} />
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">{main}</div>
        <div className="space-y-6">{aside}</div>
      </div>
      {footer}
    </div>
  );
}
