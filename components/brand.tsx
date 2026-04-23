import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md border border-border bg-card font-mono text-[11px] font-semibold tracking-tight text-foreground",
        className,
      )}
      aria-hidden
    >
      UDD
    </div>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">UDD</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Dev Desktop
        </span>
      </div>
    </div>
  )
}
