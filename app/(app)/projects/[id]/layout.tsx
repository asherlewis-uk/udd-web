import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { getProjectByIdAndOwner } from "@/lib/db/queries";
import { touchProjectOpened } from "@/app/actions/projects";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const user = session.user;

  const project = await getProjectByIdAndOwner(id, user.id);

  if (!project) notFound();

  // Fire-and-forget — do not block rendering.
  touchProjectOpened(id).catch(() => {});

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
