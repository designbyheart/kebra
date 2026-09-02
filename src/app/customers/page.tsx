import { CustomersResults } from "@/components/organisms/customers-results";
import { ListPage } from "@/components/templates/list-page";
import { searchCustomers, type CustomerFilters, type CustomerSort, type CustomerSortColumn } from "./queries";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const SORT_COLUMNS: CustomerSortColumn[] = ["name", "kind", "sites", "jobs", "last_job", "balance", "match"];

function parseNumberParam(v: string | string[] | undefined): number | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  return undefined;
}

function parseDollarsToCents(v: string | string[] | undefined): number | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

function parseKinds(sp: Record<string, string | string[] | undefined>): string[] {
  const raw = sp.kind;
  if (!raw) return [];
  let list: string[];
  if (Array.isArray(raw)) list = raw;
  else list = [raw];
  return list.filter((k): k is "business" | "homeowner" => k === "business" || k === "homeowner");
}

function parseFilters(sp: Record<string, string | string[] | undefined>): CustomerFilters {
  return {
    kinds: parseKinds(sp),
    balanceMin: parseDollarsToCents(sp.balance_min),
    balanceMax: parseDollarsToCents(sp.balance_max),
    jobsMin: parseNumberParam(sp.jobs_min),
    jobsMax: parseNumberParam(sp.jobs_max),
    sitesMin: parseNumberParam(sp.sites_min),
    sitesMax: parseNumberParam(sp.sites_max),
  };
}

function parseSort(sp: Record<string, string | string[] | undefined>): CustomerSort | null {
  let column: string | undefined;
  if (typeof sp.sort === "string") column = sp.sort;
  if (!column || !SORT_COLUMNS.includes(column as CustomerSortColumn)) return null;
  let direction: "asc" | "desc" = "desc";
  if (sp.dir === "asc") direction = "asc";
  return { column: column as CustomerSortColumn, direction };
}

export default async function CustomersPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" && sp.q) || "";
  const filters = parseFilters(sp);
  const sort = parseSort(sp);
  const result = await searchCustomers(q, filters, sort);
  const now = new Date();

  return (
    <ListPage title="Customers" description="Search by name, company, phone or service address. Addresses open the dossier.">
      <CustomersResults result={result} now={now} />
    </ListPage>
  );
}
