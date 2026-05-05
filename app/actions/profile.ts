"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { getSession } from "@/lib/auth-session"
import { getDb } from "@/lib/db"
import { profiles, user } from "@/lib/db/schema"

export async function updateDisplayName(displayName: string) {
  const session = await getSession()
  if (!session) throw new Error("Not authenticated")

  await getDb()
    .update(profiles)
    .set({ displayName: displayName.trim() || null })
    .where(eq(profiles.id, session.user.id))

  revalidatePath("/settings")
}

export async function deleteAccount(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: "Not authenticated" }

    await getDb().delete(user).where(eq(user.id, session.user.id))
    await auth.api.signOut({ headers: await headers() })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete account",
    }
  }
}
