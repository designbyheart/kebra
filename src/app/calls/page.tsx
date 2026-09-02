import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Calls" };

export default function CallsPage() {
  return (
    <div>
      <PageHeader title="Calls" description="Every call the agent has handled." />
      <p className="text-sm text-muted-foreground">Coming in Wave 2.</p>
    </div>
  );
}
