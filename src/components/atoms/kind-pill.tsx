import { Building2, House } from "lucide-react";
import { kindLabel } from "@/lib/ui/format";

const ICON = { Business: Building2, Homeowner: House } as const;

export type KindPillProps = { kind: string | null; company?: string | null };

/** Homeowner / Business pill next to a customer name. */
export function KindPill({ kind, company }: KindPillProps) {
  const label = kindLabel(kind, company) as keyof typeof ICON;
  const Icon = ICON[label] ?? House;
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
      <Icon className="size-3" />
      {label}
    </span>
  );
}
