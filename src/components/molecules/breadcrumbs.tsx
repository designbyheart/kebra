import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const NAV_CLASS = {
  wrap: "flex flex-wrap items-center gap-1 text-sm text-muted-foreground",
  nowrap: "flex items-center gap-1 text-sm text-muted-foreground",
} as const;

export type BreadcrumbItem = { href?: string; label: string };

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  /** Allow the trail to wrap onto a second line (address page). */
  wrap?: boolean;
};

/** Customers › Name › Street. Items with an href are links; the rest are the current page. */
export function Breadcrumbs({ items, wrap = false }: BreadcrumbsProps) {
  const mode = (wrap && "wrap") || "nowrap";
  return (
    <nav className={NAV_CLASS[mode]}>
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3" />}
          {item.href && (
            <Link href={item.href} className="hover:underline">
              {item.label}
            </Link>
          )}
          {!item.href && <span className="text-foreground">{item.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}
