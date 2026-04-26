"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveAIProviderConfig } from "@/app/actions/provider-configs"
import { getProviderOptions, type ProviderId } from "@/lib/ai/providers"

// Single source of truth: lib/ai/providers/index.ts. Do not duplicate.
const PROVIDER_OPTIONS = getProviderOptions()

/**
 * Inline provider switcher for the cockpit. Reuses the same server action
 * used by the Settings form, so there is exactly one write path for the
 * user's default AI provider. Credentials are not handled here — they
 * remain server-environment-managed.
 */
export function ProviderSwitcher({
  currentProviderId,
  disabled,
}: {
  currentProviderId: ProviderId
  disabled?: boolean
}) {
  const router = useRouter()
  // Optimistic value so the trigger updates immediately while the action runs.
  const [value, setValue] = useState<ProviderId>(currentProviderId)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: string) => {
    if (next === value) return
    const previous = value
    const nextId = next as ProviderId
    setValue(nextId)
    setError(null)
    startTransition(async () => {
      try {
        await saveAIProviderConfig({ providerId: nextId, setAsDefault: true })
        // Refresh so server components (badge label, settings) re-read.
        router.refresh()
      } catch (err) {
        // Roll back optimistic state on failure.
        setValue(previous)
        setError(err instanceof Error ? err.message : "Failed to save.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={disabled || isPending}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto gap-1.5 border-border/60 bg-transparent px-2 text-xs"
          aria-label="Active AI provider"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {PROVIDER_OPTIONS.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <span className="text-[11px] text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
