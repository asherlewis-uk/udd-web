"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * While a run is transitioning (starting / running / stopping), re-fetch the
 * server component tree every 700ms so new events and status changes appear.
 * No-op once settled.
 */
export function RunPoller({ active }: { active: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      router.refresh()
    }, 700)
    return () => window.clearInterval(id)
  }, [active, router])

  return null
}
