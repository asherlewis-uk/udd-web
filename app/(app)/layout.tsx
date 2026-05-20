import { redirect } from "next/navigation"
import { TopNav } from "@/components/app/top-nav"
import { getSession } from "@/lib/auth-session"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  const user = session.user

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="pointer-events-none fixed inset-0 bg-radial-[at_50%_0%] from-glass-purple/6 via-transparent to-transparent" aria-hidden />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
