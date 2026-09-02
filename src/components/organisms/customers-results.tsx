import { CustomerFilters } from "@/components/molecules/customer-filters";
import { CustomerSearch } from "@/components/molecules/customer-search";
import { AddressMatches } from "@/components/organisms/address-matches";
import { CustomersTable } from "@/components/organisms/customers-table";
import type { CustomerSearchResult } from "@/app/customers/queries";
import { matchCount } from "@/lib/ui/format";

export type CustomersResultsProps = { result: CustomerSearchResult; now: Date };

/** Search bar, filters, and either the recent-customers list or the address / customer hits. */
export function CustomersResults({ result, now }: CustomersResultsProps) {
  const nothing = result.customers.length === 0 && result.addresses.length === 0;
  let sortParam: string | undefined;
  if (result.recent || result.sort.column !== "match") sortParam = result.sort.column;
  return (
    <>
      <div className="mb-4 space-y-4">
        <CustomerSearch query={result.query} />
        <CustomerFilters
          filters={result.filters}
          query={result.query}
          sortParam={sortParam}
          dirParam={result.sort.direction}
        />
      </div>

      {result.recent && (
        <section>
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent customers</div>
          <CustomersTable rows={result.customers} now={now} sort={result.sort} query={result.query} />
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
            {!nothing && <CustomersTable rows={result.customers} now={now} showMatch sort={result.sort} query={result.query} />}
          </section>
        </div>
      )}
    </>
  );
}
