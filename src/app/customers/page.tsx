import { PageHeader } from "@/components/page-header";
import { CustomerSearch } from "@/components/customers/customer-search";
import { AddressMatches, CustomersTable } from "@/components/customers/customers-table";
import { searchCustomers } from "./queries";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const result = await searchCustomers(q);
  const now = new Date();

  return (
    <div>
      <PageHeader title="Customers" description="Search by name, company, phone or service address. Addresses open the dossier." />
      <div className="mb-4">
        <CustomerSearch query={result.query} />
      </div>

      {result.recent ? (
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent customers</h2>
          <CustomersTable rows={result.customers} now={now} />
        </section>
      ) : (
        <div className="space-y-8">
          {result.addresses.length ? (
            <section>
              <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Addresses <span className="font-normal normal-case">· {result.addresses.length} match{result.addresses.length === 1 ? "" : "es"}</span>
              </h2>
              <AddressMatches rows={result.addresses} now={now} />
            </section>
          ) : null}
          <section>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Customers <span className="font-normal normal-case">· {result.customers.length} match{result.customers.length === 1 ? "" : "es"}</span>
            </h2>
            {result.customers.length === 0 && result.addresses.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Nothing matches “{result.query}”. Try a last name, the company, or the street number and name.</p>
            ) : (
              <CustomersTable rows={result.customers} now={now} showMatch />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
