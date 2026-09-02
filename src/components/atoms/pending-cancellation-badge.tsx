import { cn } from "@/lib/utils";

/** Striped red so it reads differently from a plain canceled (gray) or a live (blue) job. */
export const PENDING_CANCELLATION_STRIPES =
  "bg-[repeating-linear-gradient(135deg,rgb(239_68_68/0.16)_0_4px,transparent_4px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgb(248_113_113/0.22)_0_4px,transparent_4px_9px)]";

const SIZE = {
  /** Fits inside dense board cards. */
  sm: "h-4 px-1.5 text-xs leading-none",
  /** Default chip. */
  md: "h-5 px-2 text-xs",
} as const;

export type PendingCancellationBadgeProps = {
  className?: string;
  size?: keyof typeof SIZE;
  /** Override the label (e.g. "Pending" when space is tight). */
  label?: string;
  title?: string;
};

/** Shared "Pending cancellation" state marker (PLAN §3 D12). */
export function PendingCancellationBadge({
  className,
  size = "md",
  label = "Pending cancellation",
  title = "The caller asked to cancel; an admin has to approve it. Nothing is canceled yet.",
}: PendingCancellationBadgeProps) {
  return (
    <span
      data-slot="pending-cancellation-badge"
      title={title}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border font-medium whitespace-nowrap",
        "border-red-500/50 text-red-700 dark:border-red-400/50 dark:text-red-300",
        PENDING_CANCELLATION_STRIPES,
        SIZE[size],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
      {label}
    </span>
  );
}
