import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md liquid-glass prismatic-border font-mono text-[11px] font-semibold tracking-tight bg-gradient-to-r from-glass-purple to-glass-coral bg-clip-text text-transparent",
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
        <span className="text-[10px] uppercase tracking-[0.14em] text-glass-purple-muted">
          Dev Desktop
        </span>
      </div>
    </div>
  )
}
