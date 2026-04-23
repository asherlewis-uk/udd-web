"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Search } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

const STATUSES = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const

export function ProjectFilters({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string
  initialStatus: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  function update(params: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString())
    for (const [k, v] of Object.entries(params)) {
      if (!v || v === "all") next.delete(k)
      else next.set(k, v)
    }
    router.replace(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <InputGroup className="w-full sm:max-w-sm">
        <InputGroupAddon>
          <Search className="h-4 w-4" />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search projects"
          defaultValue={initialQuery}
          onChange={(e) => update({ q: e.target.value || null })}
          aria-label="Search projects"
        />
      </InputGroup>
      <ToggleGroup
        type="single"
        size="sm"
        value={initialStatus || "all"}
        onValueChange={(v) => update({ status: v || "all" })}
        className="self-start sm:self-auto"
      >
        {STATUSES.map((s) => (
          <ToggleGroupItem key={s.value} value={s.value}>
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
