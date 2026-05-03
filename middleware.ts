import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Exclude /api/health from auth gating so Docker HEALTHCHECK and any
  // upstream load balancer can probe liveness without going through
  // Supabase session refresh.
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
