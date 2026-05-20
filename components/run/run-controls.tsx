"use client";

import { useTransition } from "react";
import { Play, Square, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startRunAction, stopRunAction } from "@/app/actions/run";
import type { RunStatus } from "@/lib/types";

export function RunControls({
  projectId,
  sessionId,
  status,
}: {
  projectId: string;
  sessionId: string | null;
  status: RunStatus;
}) {
  const [pending, startTransition] = useTransition();

  const isBusy = status === "starting" || status === "stopping";
  const isRunning = status === "running";
  const canStart = !isBusy && !isRunning;

  const handleStart = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("project_id", projectId);
      await startRunAction(fd);
    });
  };

  const handleStop = () => {
    if (!sessionId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("session_id", sessionId);
      fd.set("project_id", projectId);
      await stopRunAction(fd);
    });
  };

  if (isRunning) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleStop}
        disabled={pending}
        className="h-8 gap-1.5 rounded-md border-glass-border/30 bg-background/60"
      >
        {pending ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Square className="h-3.5 w-3.5" />
        )}
        Stop local preview
      </Button>
    );
  }

  if (isBusy) {
    return (
      <Button
        type="button"
        size="sm"
        disabled
        className="h-8 gap-1.5 rounded-md"
      >
        <Spinner className="h-3.5 w-3.5" />
        {status === "starting"
          ? "Starting local preview"
          : "Stopping local preview"}
      </Button>
    );
  }

  const isRestart = status === "stopped" || status === "error";

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleStart}
      disabled={pending || !canStart}
      className="h-8 gap-1.5 rounded-md bg-linear-to-r from-glass-purple to-glass-coral hover:from-glass-purple/90 hover:to-glass-coral/90 text-white shadow-lg shadow-glass-purple/20"
    >
      {pending ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : isRestart ? (
        <RotateCw className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
      {isRestart ? "Restart local preview" : "Start local preview"}
    </Button>
  );
}
