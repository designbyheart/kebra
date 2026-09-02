import Link from "next/link";
import { LiveDot } from "@/components/atoms/live-dot";
import { cn } from "@/lib/utils";

const CHIP_CLASS = {
  active: "border-foreground bg-foreground text-background",
  idle: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
} as const;

const COUNT_CLASS = {
  active: "bg-background/20",
  idle: "bg-muted",
} as const;

export type CallFilterChipProps = {
  href: string;
  label: string;
  active: boolean;
  /** Count badge; `null` for chips without a count (All). */
  count: number | null;
  /** Pulsing dot in front of the label (Live chip while a call is live). */
  liveDot: boolean;
};

/** One All / Live / Today / Needs review / Handoffs tab link on the calls list. */
export function CallFilterChip({ href, label, active, count, liveDot }: CallFilterChipProps) {
  const state = (active && "active") || "idle";
  return (
    <Link href={href} role="tab" aria-selected={active} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors", CHIP_CLASS[state])}>
      {liveDot && <LiveDot className="size-1.5" />}
      {label}
      {count != null && count > 0 && <span className={cn("rounded-full px-1.5 text-xs tabular-nums", COUNT_CLASS[state])}>{count}</span>}
    </Link>
  );
}
