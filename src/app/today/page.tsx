import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <div>
      <PageHeader title="Today" description="What is on the board today, live." />
      <p className="text-sm text-muted-foreground">Coming in Wave 2.</p>
    </div>
  );
}
