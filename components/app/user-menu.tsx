"use client"

import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogOut, User } from "lucide-react"

export function UserMenu({
  email,
  displayName,
}: {
  email: string
  displayName: string | null
}) {
  const label = displayName?.trim() || email.split("@")[0]
  const initials = label.slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-sm outline-none transition hover:border-border hover:bg-card focus-visible:border-border focus-visible:bg-card">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-secondary text-[10px] font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[140px] truncate text-muted-foreground sm:inline">
          {label}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm">{label}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <User className="mr-2 h-4 w-4" />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center text-sm"
              aria-label="Sign out"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
