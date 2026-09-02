export type BoardPageProps = {
  main: React.ReactNode;
  /** Right column on xl (the activity strip or its skeleton). */
  aside: React.ReactNode;
  /** Loading state attributes. */
  busy?: boolean;
  label?: string;
};

/** Today: the board with the activity strip beside it on wide screens. */
export function BoardPage({ main, aside, busy, label }: BoardPageProps) {
  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start" aria-busy={busy} aria-label={label}>
      <div className="min-w-0 flex-1">{main}</div>
      {aside}
    </div>
  );
}
