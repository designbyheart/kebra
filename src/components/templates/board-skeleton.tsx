import { BoardPage } from "./board-page";

const HEADER_CHIPS = [0, 1, 2, 3, 4];
const ROWS = [0, 1, 2, 3, 4, 5];

/**
 * Where the placeholder card sits in row `i`. Computed from the row index so
 * the skeleton looks like a spread of jobs rather than a stack; a class per
 * row would hard-code the same arithmetic six times.
 */
function placeholderCardStyle(i: number) {
  return { left: `${((i * 11) % 60) + 5}%`, width: "14%" } as const;
}

export type BoardSkeletonProps = Record<string, never>;

/** /today loading state: header, six skeleton rows and an empty activity column. */
export function BoardSkeleton() {
  return (
    <BoardPage
      busy
      label="Loading the board"
      main={
        <>
          <header className="mb-4 border-b pb-4">
            <div className="h-7 w-72 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-96 animate-pulse rounded bg-muted" />
            <div className="mt-3 flex gap-1.5">
              {HEADER_CHIPS.map((i) => (
                <div key={i} className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          </header>
          <div className="rounded-lg border bg-card">
            <div className="h-7 border-b bg-muted/40" />
            {ROWS.map((i) => (
              <div key={i} className="grid grid-cols-[176px_1fr] border-b last:border-b-0">
                <div className="border-r px-3 py-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-muted" />
                </div>
                <div className="relative h-[116px]">
                  <div className="absolute top-2 h-[108px] animate-pulse rounded-md bg-muted" style={placeholderCardStyle(i)} />
                </div>
              </div>
            ))}
          </div>
        </>
      }
      aside={
        <div className="h-96 rounded-lg border bg-card xl:w-80 xl:shrink-0">
          <div className="h-7 border-b bg-muted/40" />
        </div>
      }
    />
  );
}
