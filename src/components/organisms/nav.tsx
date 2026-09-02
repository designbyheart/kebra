"use client";

import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, Phone, Users, Wrench } from "lucide-react";
import { NavLink } from "@/components/molecules/nav-link";

export const NAV = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

export type NavProps = Record<string, never>;

/** Sidebar navigation; the entry matching the current route is highlighted. */
export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV.map(({ href, label, icon }) => (
        <NavLink key={href} href={href} label={label} icon={icon} active={pathname === href || pathname.startsWith(href + "/")} />
      ))}
    </nav>
  );
}
