import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"

export default async function AiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ task?: string }>
}) {
  const { id } = await params
  const { task } = await searchParams

  const session = await getSession()
  if (!session) redirect("/auth/login")

  const qs = task ? `?task=${encodeURIComponent(task)}` : ""
  redirect(`/projects/${id}${qs}`)
}
