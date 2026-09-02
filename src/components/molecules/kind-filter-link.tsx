import Link from "next/link";
import { cn } from "@/lib/utils";

const BASE = {
  /** "All kinds": plain text chip. */
  all: "rounded-md px-2 py-1",
  /** One kind: chip with an optional open-count badge. */
  kind: "inline-flex items-center gap-1 rounded-md px-2 py-1",
} as const;
const STATE = { active: "bg-muted font-medium", idle: "text-muted-foreground hover:text-foreground" } as const;

export type KindFilterLinkProps = {
  href: string;
  active: boolean;
  children: React.ReactNode;
  /** Open tasks of this kind; the badge is hidden at zero. */
  count?: number;
  variant?: keyof typeof BASE;
};

/** One chip of the inbox kind nav. */
export function KindFilterLink({ href, active, children, count = 0, variant = "kind" }: KindFilterLinkProps) {
  const state = (active && "active") || "idle";
  return (
    <Link href={href} className={cn(BASE[variant], STATE[state])}>
      {children}
      {count > 0 && <span className="rounded bg-background px-1 text-xs tabular-nums ring-1 ring-border">{count}</span>}
    </Link>
  );
}
