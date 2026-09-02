import { CustomerSearch } from "@/components/molecules/customer-search";
import { AddressMatches } from "@/components/organisms/address-matches";
import { CustomersTable } from "@/components/organisms/customers-table";
import type { CustomerSearchResult } from "@/app/customers/queries";
import { matchCount } from "@/lib/ui/format";

export type CustomersResultsProps = { result: CustomerSearchResult; now: Date };

/** Search bar plus either the recent-customers list or the address / customer hits. */
export function CustomersResults({ result, now }: CustomersResultsProps) {
  const nothing = result.customers.length === 0 && result.addresses.length === 0;
  return (
    <>
      <div className="mb-4">
        <CustomerSearch query={result.query} />
      </div>

      {result.recent && (
        <section>
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent customers</div>
          <CustomersTable rows={result.customers} now={now} />
        </section>
      )}
      {!result.recent && (
        <div className="space-y-8">
          {result.addresses.length > 0 && (
            <section>
              <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Addresses <span className="font-normal normal-case">· {matchCount(result.addresses.length)}</span>
              </div>
              <AddressMatches rows={result.addresses} now={now} />
            </section>
          )}
          <section>
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Customers <span className="font-normal normal-case">· {matchCount(result.customers.length)}</span>
            </div>
            {nothing && <p className="py-6 text-sm text-muted-foreground">Nothing matches “{result.query}”. Try a last name, the company, or the street number and name.</p>}
            {!nothing && <CustomersTable rows={result.customers} now={now} showMatch />}
          </section>
        </div>
      )}
    </>
  );
}
