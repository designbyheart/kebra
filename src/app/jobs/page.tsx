import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Jobs" };

export default function JobsPage() {
  return (
    <div>
      <PageHeader title="Jobs" description="All jobs, past and upcoming." />
      <p className="text-sm text-muted-foreground">Coming in Wave 2.</p>
    </div>
  );
}
