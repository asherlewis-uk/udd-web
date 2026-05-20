"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { createProject } from "@/app/actions/projects"
import { slugify } from "@/lib/slug"

export function CreateProjectForm() {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [idea, setIdea] = useState("")
  const [error, setError] = useState<string | null>(null)

  const slugPreview = slugify(name || "untitled-project")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError("Name is required.")
      return
    }
    const fd = new FormData()
    fd.set("name", name)
    fd.set("description", description)
    fd.set("idea", idea)
    startTransition(async () => {
      try {
        await createProject(fd)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create project"
        if (!msg.toLowerCase().includes("next_redirect")) {
          setError(msg)
          toast.error(msg)
        }
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekend build"
            required
          />
          <FieldDescription>
            Will become <span className="font-mono text-foreground">{slugPreview}</span>
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Short description</FieldLabel>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line summary"
          />
          <FieldDescription>Shown on the project card. Optional.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="idea">The idea</FieldLabel>
          <Textarea
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe what you want to build. What is the core loop? Who is it for? What does success look like?"
            rows={6}
          />
          <FieldDescription>
            This becomes the seed context for future AI work. You can edit it anytime.
          </FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="submit" disabled={pending} className="bg-linear-to-r from-glass-purple to-glass-coral hover:from-glass-purple/90 hover:to-glass-coral/90 text-white shadow-lg shadow-glass-purple/20">
            {pending ? <Spinner className="mr-2" /> : null}
            Create project
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
