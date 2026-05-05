import "server-only"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export async function getSession() {
  return await auth.api.getSession({ headers: await headers() })
}
