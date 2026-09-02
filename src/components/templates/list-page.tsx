import { PageHeader } from "@/components/molecules/page-header";
import { cn } from "@/lib/utils";

const STACK = { on: "space-y-4", off: undefined } as const;

export type ListPageProps = {
  title: string;
  description?: string;
  /** Add vertical rhythm between the header and the sections (Jobs). */
  stack?: boolean;
  /** Render-nothing islands (live refresh) mounted before the header. */
  before?: React.ReactNode;
  children: React.ReactNode;
};

/** Page header plus content: Calls, Customers, Jobs, Inbox. */
export function ListPage({ title, description, stack = false, before, children }: ListPageProps) {
  return (
    <div className={cn(stack && STACK.on)}>
      {before}
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}
