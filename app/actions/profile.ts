"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function updateDisplayName(displayName: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName.trim() || null })
    .eq("id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/settings")
}

export async function deleteAccount(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError) return { success: false, error: authError.message }
    if (!user) return { success: false, error: "Not authenticated" }

    const serviceClient = createServiceClient()
    const { error } = await serviceClient.auth.admin.deleteUser(user.id)
    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete account",
    }
  }
}
