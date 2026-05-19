import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background px-4 pb-safe pt-safe text-foreground md:hidden">
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 pt-4">
          <Skeleton className="h-11 w-11 rounded-full bg-muted/35" />
          <div className="flex min-w-0 flex-col items-center gap-2">
            <Skeleton className="h-3 w-12 rounded-full bg-muted/50" />
            <Skeleton className="h-4 w-28 rounded-full bg-muted/35" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full bg-muted/35" />
        </header>

        <div className="flex flex-1 flex-col justify-center gap-5 py-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-border/50 bg-secondary/50 text-sm font-semibold tracking-wide text-muted-foreground">
            udd
          </div>
          <div className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-border/60 bg-secondary/45 p-3">
            <Skeleton className="h-5 w-2/3 rounded-full bg-muted/45" />
            <Skeleton className="h-3 w-full rounded-full bg-muted/35" />
            <Skeleton className="h-3 w-4/5 rounded-full bg-muted/35" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-10 rounded-full bg-muted/35" />
            <Skeleton className="h-10 rounded-full bg-muted/35" />
            <Skeleton className="h-10 rounded-full bg-muted/35" />
          </div>
        </div>
      </main>

      <main className="mx-auto hidden w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8 md:flex">
        <section className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-9 w-32" />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-9 w-32" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
