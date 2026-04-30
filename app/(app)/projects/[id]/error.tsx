"use client"

import Link from "next/link"
import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.log("[v0] workspace error:", error.message)
  }, [error])

  return (
    <main className="flex w-full flex-1 flex-col gap-6 px-4 py-6 md:mx-auto md:max-w-6xl md:px-5 md:py-8">
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-5 md:rounded-lg md:p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <h1 className="text-sm font-semibold">Could not load this project</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {error.message || "The project could not be loaded. It may have been deleted."}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
