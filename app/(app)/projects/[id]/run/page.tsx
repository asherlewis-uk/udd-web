import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session) redirect("/auth/login");

  redirect(`/projects/${id}?panel=run`);
}


