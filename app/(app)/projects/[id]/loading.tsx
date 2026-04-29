import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <>
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background px-4 pb-safe pt-safe text-foreground md:hidden">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pt-4">
          <Skeleton className="h-11 w-11 rounded-full bg-muted/35" />
          <div className="flex min-w-0 flex-col items-center gap-2">
            <Skeleton className="h-4 w-32 rounded-full bg-muted/45" />
            <Skeleton className="h-3 w-20 rounded-full bg-muted/35" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full bg-muted/35" />
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 py-5">
          <div className="flex flex-1 flex-col justify-end gap-3">
            <div className="max-w-[82%] rounded-3xl rounded-bl-lg border border-border/50 bg-secondary/45 p-3">
              <Skeleton className="h-4 w-36 rounded-full bg-muted/45" />
              <Skeleton className="mt-3 h-3 w-full rounded-full bg-muted/35" />
              <Skeleton className="mt-2 h-3 w-3/4 rounded-full bg-muted/35" />
            </div>
            <div className="ml-auto max-w-[78%] rounded-3xl rounded-br-lg border border-border/50 bg-muted/25 p-3">
              <Skeleton className="h-3 w-44 rounded-full bg-muted/40" />
              <Skeleton className="mt-2 h-3 w-24 rounded-full bg-muted/35" />
            </div>
          </div>
          <div className="rounded-4xl border border-border/60 bg-secondary/45 p-3">
            <Skeleton className="h-11 w-full rounded-full bg-muted/35" />
          </div>
        </div>
      </main>

      <main className="mx-auto hidden w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 md:flex">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-1 border-b border-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </main>
    </>
  );
}
