import Link from "next/link";
import { STATUS_FILTER_LABEL, type StatusFilter } from "@/lib/ui/inbox-grouping";
import { cn } from "@/lib/utils";

const LINK = {
  active: "bg-primary text-primary-foreground",
  idle: "text-muted-foreground hover:bg-muted hover:text-foreground",
} as const;
const COUNT = { active: "opacity-80", idle: "opacity-70" } as const;
const CURRENT = { active: "page", idle: undefined } as const;

export type StatusFilterLinkProps = {
  status: StatusFilter;
  href: string;
  active: boolean;
  count: number;
};

/** One tab of the inbox status nav (Open 12 · In progress 3 · …). */
export function StatusFilterLink({ status, href, active, count }: StatusFilterLinkProps) {
  const state = (active && "active") || "idle";
  return (
    <Link href={href} aria-current={CURRENT[state]} className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors", LINK[state])}>
      {STATUS_FILTER_LABEL[status]}
      <span className={cn("tabular-nums", COUNT[state])}>{count}</span>
    </Link>
  );
}
