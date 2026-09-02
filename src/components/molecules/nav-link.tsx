import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STATE = {
  active: "bg-accent text-accent-foreground",
  idle: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
} as const;

export type NavLinkProps = { href: string; label: string; icon: LucideIcon; active: boolean };

/** One sidebar navigation entry. */
export function NavLink({ href, label, icon: Icon, active }: NavLinkProps) {
  const state = (active && "active") || "idle";
  return (
    <Link href={href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", STATE[state])}>
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
