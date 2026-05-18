import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="liquid-glass prismatic-inner rounded-2xl px-8 py-12 flex flex-col items-center gap-6 text-center">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-glass-purple-muted">
          404 &middot; not found
        </div>
        <h1 className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent text-balance text-3xl font-semibold tracking-tight">
          This page doesn&apos;t exist.
        </h1>
        <p className="max-w-md text-pretty text-sm text-glass-purple-muted/70">
          The project or page you tried to open is missing, or you don&apos;t have access to it.
        </p>
        <Button asChild className="bg-linear-to-r from-glass-purple to-glass-coral hover:from-glass-purple/90 hover:to-glass-coral/90 text-white shadow-lg shadow-glass-purple/20">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    </div>
  )
}
