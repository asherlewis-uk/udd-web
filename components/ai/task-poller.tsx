"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * While any task is pending or running, re-fetch the server component tree
 * every ~800ms so status transitions and new events become visible.
 * No-op once everything has settled.
 */
export function TaskPoller({ active }: { active: boolean }) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      router.refresh()
    }, 800)
    return () => window.clearInterval(id)
  }, [active, router])

  return null
}
