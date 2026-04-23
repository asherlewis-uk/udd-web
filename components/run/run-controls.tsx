"use client"

import { useTransition } from "react"
import { Play, Square, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { startRunAction, stopRunAction } from "@/app/actions/run"
import type { RunStatus } from "@/lib/types"

export function RunControls({
  projectId,
  sessionId,
  status,
}: {
  projectId: string
  sessionId: string | null
  status: RunStatus
}) {
  const [pending, startTransition] = useTransition()

  const isBusy = status === "starting" || status === "stopping"
  const isRunning = status === "running"
  const canStart = !isBusy && !isRunning

  const handleStart = () => {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("project_id", projectId)
      await startRunAction(fd)
    })
  }

  const handleStop = () => {
    if (!sessionId) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("session_id", sessionId)
      fd.set("project_id", projectId)
      await stopRunAction(fd)
    })
  }

  if (isRunning) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleStop}
        disabled={pending}
      >
        {pending ? <Spinner className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        Stop
      </Button>
    )
  }

  if (isBusy) {
    return (
      <Button type="button" size="sm" disabled>
        <Spinner className="h-3.5 w-3.5" />
        {status === "starting" ? "Starting" : "Stopping"}
      </Button>
    )
  }

  const isRestart = status === "stopped" || status === "error"

  return (
    <Button type="button" size="sm" onClick={handleStart} disabled={pending || !canStart}>
      {pending ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : isRestart ? (
        <RotateCw className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {isRestart ? "Restart" : "Start Run"}
    </Button>
  )
}
