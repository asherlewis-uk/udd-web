import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { UserMenu } from "@/components/app/user-menu";
import { getSession } from "@/lib/auth-session";
import { getProfileDisplayName } from "@/lib/db/queries";

export async function TopNav() {
  const session = await getSession();
  const user = session?.user ?? null;

  let displayName: string | null = null;
  if (user) {
    displayName = await getProfileDisplayName(user.id);
  }

  return (
    <header className="sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-glass-border/30 bg-background/85 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:flex">
      <div className="flex items-center gap-6">
        <Link href="/projects" aria-label="u did dat projects">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link
            href="/projects"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-glass-purple/10 hover:text-glass-purple"
          >
            Projects
          </Link>
          <Link
            href="/settings"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-glass-purple/10 hover:text-glass-purple"
          >
            Settings
          </Link>
        </nav>
      </div>
      {user ? (
        <UserMenu email={user.email ?? ""} displayName={displayName} />
      ) : (
        <Link
          href="/auth/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
