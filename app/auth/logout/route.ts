import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function POST(request: Request) {
  await auth.api.signOut({ headers: await headers() })
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/auth/login`, { status: 303 })
}
