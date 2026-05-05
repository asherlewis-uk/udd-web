import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { createClient } from "@/lib/db/supabase-legacy";
import { touchProjectOpened } from "@/app/actions/projects";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const session = await getSession();
  if (!session) notFound();
  const user = session.user;

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) notFound();

  // Fire-and-forget — do not block rendering.
  touchProjectOpened(id).catch(() => {});

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
