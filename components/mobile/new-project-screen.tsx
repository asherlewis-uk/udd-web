"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { createProject } from "@/app/actions/projects";
import { slugify } from "@/lib/slug";

export function MobileNewProjectScreen() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [idea, setIdea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const slugPreview = slugify(name || "untitled-project");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("idea", idea);

    startTransition(async () => {
      try {
        await createProject(formData);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create project";
        if (!message.toLowerCase().includes("next_redirect")) {
          setError(message);
          toast.error(message);
        }
      }
    });
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 pb-safe pt-safe text-foreground md:hidden">
      <header className="flex items-center gap-3 pt-4">
        <Link
          href="/projects"
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
          aria-label="Back to projects"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">New project</h1>
          <p className="text-sm text-muted-foreground">Start with a name and idea.</p>
        </div>
      </header>

      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col gap-6 py-6">
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Project seed
          </h2>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
            <label className="flex flex-col gap-2 px-4 py-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Weekend build"
                required
                disabled={pending}
                className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
              <span className="text-xs text-muted-foreground">
                Will become <span className="font-mono text-foreground">{slugPreview}</span>
              </span>
            </label>
            <div className="mx-4 h-px bg-border/60" />
            <label className="flex flex-col gap-2 px-4 py-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Short description
              </span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="One line summary"
                disabled={pending}
                className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </label>
            <div className="mx-4 h-px bg-border/60" />
            <label className="flex flex-col gap-2 px-4 py-4">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                The idea
              </span>
              <textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Describe what you want to build. What is the core loop? Who is it for?"
                rows={6}
                disabled={pending}
                className="resize-none rounded-2xl border border-border/60 bg-background/70 px-3 py-3 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </label>
          </div>
        </section>

        {error ? <p className="px-1 text-sm text-destructive">{error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-auto rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating..." : "Create project"}
        </button>
      </form>
    </main>
  );
}
