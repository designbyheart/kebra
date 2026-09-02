import { BackLink, type BackLinkProps } from "@/components/molecules/back-link";
import { cn } from "@/lib/utils";

const STACK = { on: "space-y-4", off: undefined } as const;

export type DetailPageProps = {
  /** Render-nothing islands (live refresh) mounted first. */
  live?: React.ReactNode;
  /** "← Jobs" style back link above the header. */
  back?: BackLinkProps;
  header: React.ReactNode;
  /** Add vertical rhythm between the sections (Job page). */
  stack?: boolean;
  children: React.ReactNode;
};

/** A single record: crumb, header, sections. */
export function DetailPage({ live, back, header, stack = false, children }: DetailPageProps) {
  return (
    <div className={cn(stack && STACK.on)}>
      {live}
      {back && <BackLink href={back.href} label={back.label} />}
      {header}
      {children}
    </div>
  );
}
