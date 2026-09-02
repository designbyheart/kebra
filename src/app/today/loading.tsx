export default function TodayLoading() {
  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start" aria-busy="true" aria-label="Loading the board">
      <div className="min-w-0 flex-1">
        <header className="mb-4 border-b pb-4">
          <div className="h-7 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-muted" />
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        </header>
        <div className="rounded-lg border bg-card">
          <div className="h-7 border-b bg-muted/40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: "176px 1fr" }}>
              <div className="border-r px-3 py-3">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="relative h-[76px]">
                <div className="absolute top-2 h-[68px] animate-pulse rounded-md bg-muted" style={{ left: `${(i * 11) % 60 + 5}%`, width: "14%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="h-96 rounded-lg border bg-card xl:w-80 xl:shrink-0">
        <div className="h-7 border-b bg-muted/40" />
      </div>
    </div>
  );
}
