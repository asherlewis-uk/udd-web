import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        404 &middot; not found
      </div>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">
        This page doesn&apos;t exist.
      </h1>
      <p className="max-w-md text-pretty text-sm text-muted-foreground">
        The project or page you tried to open is missing, or you don&apos;t have access to it.
      </p>
      <Button asChild>
        <Link href="/projects">Back to projects</Link>
      </Button>
    </div>
  )
}
