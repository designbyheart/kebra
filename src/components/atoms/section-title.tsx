export type SectionTitleProps = { children: React.ReactNode; aside?: React.ReactNode };

/** Uppercase caption-style section label (not a heading element) with an optional right-aligned aside. */
export function SectionTitle({ children, aside }: SectionTitleProps) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
      {aside}
    </div>
  );
}
