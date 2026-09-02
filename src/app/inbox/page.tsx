import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <div>
      <PageHeader title="Inbox" description="Tasks, callbacks and approvals." />
      <p className="text-sm text-muted-foreground">Coming in Wave 2.</p>
    </div>
  );
}
