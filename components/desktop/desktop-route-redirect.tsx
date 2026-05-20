"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Monitor } from "lucide-react";

export function DesktopRouteRedirect({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      router.replace(href);
    }
  }, [href, router]);

  return (
    <div className="hidden min-h-0 flex-1 items-center justify-center px-6 py-10 md:flex">
      <div className="max-w-md rounded-3xl liquid-glass prismatic-border prismatic-inner p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-r from-glass-purple to-glass-coral text-white shadow-lg shadow-glass-purple/20">
          <Monitor className="h-5 w-5" />
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          Opening {title} in the desktop workspace
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Desktop routes now collapse into the canonical project workspace so desktop state stays in one shell.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-glass-border/30 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Redirecting…
        </div>
      </div>
    </div>
  );
}
