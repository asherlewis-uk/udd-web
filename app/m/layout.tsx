import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/auth/login")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {children}
    </div>
  )
}
