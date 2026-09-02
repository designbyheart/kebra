import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <div>
      <PageHeader title="Customers" description="Customers, addresses and dossiers." />
      <p className="text-sm text-muted-foreground">Coming in Wave 2.</p>
    </div>
  );
}
