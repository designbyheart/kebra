import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND = {
  review: {
    icon: AlertTriangle,
    label: "Needs review",
    className:
      "inline-flex h-5 items-center gap-1 rounded-full bg-red-50 px-1.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-950/40 dark:text-red-300",
  },
  reviewed: {
    icon: CheckCircle2,
    label: "Reviewed",
    className: "inline-flex h-5 items-center gap-1 rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground",
  },
  handoff: {
    icon: ArrowRightLeft,
    label: "Handoff",
    className:
      "inline-flex h-5 items-center gap-1 rounded-full bg-amber-50 px-1.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/40 dark:text-amber-300",
  },
} as const;

export type FlagPillProps = {
  kind: keyof typeof KIND;
  /** Override the default label (e.g. "Review" in the dense list). */
  label?: string;
  title?: string;
  className?: string;
};

/** Small status flags on calls: needs review, reviewed, handoff. */
export function FlagPill({ kind, label, title, className }: FlagPillProps) {
  const k = KIND[kind];
  const Icon = k.icon;
  return (
    <span className={cn(k.className, className)} title={title}>
      <Icon className="size-3" /> {label ?? k.label}
    </span>
  );
}
