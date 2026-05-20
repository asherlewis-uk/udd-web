import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ file?: string }>
}) {
  const { id } = await params
  const { file } = await searchParams

  const session = await getSession()
  if (!session) redirect("/auth/login")

  const qs = file ? `?file=${encodeURIComponent(file)}` : ""
  redirect(`/projects/${id}${qs}`)
}
