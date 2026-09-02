import { CustomersResults } from "@/components/organisms/customers-results";
import { ListPage } from "@/components/templates/list-page";
import { searchCustomers } from "./queries";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" && sp.q) || "";
  const result = await searchCustomers(q);
  const now = new Date();

  return (
    <ListPage title="Customers" description="Search by name, company, phone or service address. Addresses open the dossier.">
      <CustomersResults result={result} now={now} />
    </ListPage>
  );
}
