import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/atoms/ui/button";
import { Input } from "@/components/atoms/ui/input";

export type CustomerSearchProps = { query: string; placeholder?: string };

/** Plain GET form so the URL stays shareable (?q=). No client state needed. */
export function CustomerSearch({ query, placeholder = "Name, company, phone or street address" }: CustomerSearchProps) {
  return (
    <form method="get" action="/customers" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-64 flex-1 sm:max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={query} placeholder={placeholder} autoComplete="off" aria-label="Search customers" className="pl-8" />
      </div>
      <Button type="submit" variant="outline" size="default">
        Search
      </Button>
      {query && (
        <Link href="/customers" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Clear
        </Link>
      )}
    </form>
  );
}
