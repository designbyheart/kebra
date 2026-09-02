import { cn } from "@/lib/utils";

export type LiveDotProps = { className?: string };

/** Pulsing amber dot for live calls. */
export function LiveDot({ className }: LiveDotProps) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-label="Live">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
      <span className="relative inline-flex h-full w-full rounded-full bg-amber-500" />
    </span>
  );
}
