export type SessionEndedNoticeProps = { date: string };

/** Shown when /api/board answers 401: the cookie expired while the board was open. */
export function SessionEndedNotice({ date }: SessionEndedNoticeProps) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
      Your session ended.{" "}
      <a href={`/login?next=${encodeURIComponent(`/today?date=${date}`)}`} className="font-medium underline">
        Sign in again
      </a>{" "}
      to keep the board live.
    </div>
  );
}
