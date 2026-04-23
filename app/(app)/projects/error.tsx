"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.log("[v0] projects list error:", error.message)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8">
      <div className="flex flex-col items-start gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <h1 className="text-sm font-semibold">Could not load your projects</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while fetching your projects."}
        </p>
        <Button variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  )
}
