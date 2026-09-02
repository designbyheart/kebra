import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/atoms/ui/input";
import type { CallFilter } from "@/app/calls/data";

export type CallSearchFormProps = {
  filter: CallFilter;
  q: string;
  /** Where "Clear" goes: the current filter without the query. */
  clearHref: string;
};

/** GET form that searches transcripts and summaries, keeping the active filter. */
export function CallSearchForm({ filter, q, clearHref }: CallSearchFormProps) {
  return (
    <form method="get" action="/calls" className="ml-auto flex items-center gap-2">
      {filter !== "all" && <input type="hidden" name="f" value={filter} />}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Search transcripts and summaries" className="h-8 w-72 pl-7 text-sm" aria-label="Search calls" />
      </div>
      {q && (
        <Link href={clearHref} className="text-xs text-muted-foreground hover:text-foreground">
          Clear
        </Link>
      )}
    </form>
  );
}
