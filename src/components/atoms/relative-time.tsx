import { formatDateTimeET, formatTimeET } from "@/lib/time";
import { relativeTime } from "@/lib/ui/board-layout";
import { cn } from "@/lib/utils";

export type RelativeTimeProps = {
  iso: string;
  /** Client clock; `null` before hydration renders the absolute time instead. */
  now: Date | null;
  className?: string;
};

/** "4m ago" once hydrated, the ET clock time on the server (no hydration mismatch). */
export function RelativeTime({ iso, now, className }: RelativeTimeProps) {
  const text = now && relativeTime(iso, now);
  return (
    <time dateTime={iso} title={formatDateTimeET(iso)} className={cn("font-mono text-xs tabular-nums text-muted-foreground", className)}>
      {text || formatTimeET(iso)}
    </time>
  );
}
