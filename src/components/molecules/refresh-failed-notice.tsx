"use client";

export type RefreshFailedNoticeProps = { onRetry: () => void };

/** Shown when a live refetch of the board failed. */
export function RefreshFailedNotice({ onRetry }: RefreshFailedNoticeProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50">
      Could not refresh the board.
      <button type="button" className="font-medium underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
