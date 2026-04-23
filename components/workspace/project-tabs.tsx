"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FolderTree,
  Bot,
  Play,
  Terminal,
  Settings2,
} from "lucide-react"

type Tab = {
  href: (id: string) => string
  match: (pathname: string, id: string) => boolean
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const TABS: Tab[] = [
  {
    href: (id) => `/projects/${id}`,
    match: (p, id) => p === `/projects/${id}`,
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: (id) => `/projects/${id}/files`,
    match: (p, id) => p.startsWith(`/projects/${id}/files`),
    label: "Files",
    icon: FolderTree,
  },
  {
    href: (id) => `/projects/${id}/ai`,
    match: (p, id) => p.startsWith(`/projects/${id}/ai`),
    label: "AI",
    icon: Bot,
  },
  {
    href: (id) => `/projects/${id}/run`,
    match: (p, id) => p.startsWith(`/projects/${id}/run`),
    label: "Run",
    icon: Play,
  },
  {
    href: (id) => `/projects/${id}/logs`,
    match: (p, id) => p.startsWith(`/projects/${id}/logs`),
    label: "Logs",
    icon: Terminal,
  },
  {
    href: (id) => `/projects/${id}/settings`,
    match: (p, id) => p.startsWith(`/projects/${id}/settings`),
    label: "Settings",
    icon: Settings2,
  },
]

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Project sections"
      className="-mb-px flex items-center gap-1 overflow-x-auto"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname, projectId)
        const Icon = tab.icon
        return (
          <Link
            key={tab.label}
            href={tab.href(projectId)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
