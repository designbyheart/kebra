"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, Phone, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
