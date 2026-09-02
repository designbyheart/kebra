import { cn } from "@/lib/utils";

/**
 * Shared "Pending cancellation" state marker (PLAN §3 D12). Striped red so
 * it reads differently from a plain canceled (gray) or a live (blue) job.
 * Used by the Today board card, the job page and the inbox card.
 *
 * Also exported: `PENDING_CANCELLATION_STRIPES`, the same stripe pattern as
 * a class string, for units that want to tint a whole card instead.
 */
export type PendingCancellationBadgeProps = {
  className?: string;
  /** `sm` fits inside dense board cards; `md` is the default chip. */
  size?: "sm" | "md";
  /** Override the label (e.g. "Pending" when space is tight). */
  label?: string;
  title?: string;
};

export const PENDING_CANCELLATION_STRIPES =
  "bg-[repeating-linear-gradient(135deg,rgb(239_68_68/0.16)_0_4px,transparent_4px_9px)] dark:bg-[repeating-linear-gradient(135deg,rgb(248_113_113/0.22)_0_4px,transparent_4px_9px)]";

export function isPendingCancellation(status: string | null | undefined): boolean {
  return status === "pending_cancellation";
}

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
        size === "sm" ? "h-4 px-1.5 text-xs leading-none" : "h-5 px-2 text-xs",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-red-500" />
      {label}
    </span>
  );
}

export default PendingCancellationBadge;
