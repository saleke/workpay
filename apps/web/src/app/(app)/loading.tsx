export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse w-full max-w-7xl mx-auto">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-lg bg-muted/60" />
          <div className="h-4 w-96 rounded-md bg-muted/40" />
        </div>
        <div className="h-9 w-36 rounded-lg bg-muted/60" />
      </div>

      {/* Metrics Ribbon Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-28 rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="h-4 w-32 rounded bg-muted/50" />
          <div className="h-8 w-24 rounded bg-muted/60" />
          <div className="h-3 w-40 rounded bg-muted/40" />
        </div>
        <div className="h-28 rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="h-4 w-32 rounded bg-muted/50" />
          <div className="h-8 w-24 rounded bg-muted/60" />
          <div className="h-3 w-40 rounded bg-muted/40" />
        </div>
        <div className="h-28 rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="h-4 w-32 rounded bg-muted/50" />
          <div className="h-8 w-24 rounded bg-muted/60" />
          <div className="h-3 w-40 rounded bg-muted/40" />
        </div>
      </div>

      {/* Content Table Skeleton */}
      <div className="rounded-xl border border-border/70 overflow-hidden bg-card">
        <div className="h-14 border-b border-border/60 bg-muted/20 px-6 flex items-center justify-between">
          <div className="h-4 w-48 rounded bg-muted/50" />
          <div className="h-7 w-28 rounded-lg bg-muted/40" />
        </div>
        <div className="divide-y divide-border/40 p-0">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-1/3 rounded bg-muted/60" />
                <div className="h-3 w-2/3 rounded bg-muted/40" />
              </div>
              <div className="h-6 w-20 rounded-full bg-muted/50" />
              <div className="h-4 w-16 rounded bg-muted/50" />
              <div className="h-8 w-24 rounded-lg bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
