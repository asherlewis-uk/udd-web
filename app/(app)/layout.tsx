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
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
