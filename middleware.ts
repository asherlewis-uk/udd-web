import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const PUBLIC_FILE = /\.(svg|png|jpg|jpeg|webp|ico)$/
const MOBILE_UA = /Mobile|Android|iPhone|iPad/i

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  )
}

function isMobilePath(pathname: string) {
  return pathname === "/m" || pathname.startsWith("/m/")
}

function isMobileUA(ua: string | null) {
  if (!ua) return false
  return MOBILE_UA.test(ua)
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const response = NextResponse.next({ request })
  const session = await auth.api.getSession({ headers: request.headers })

  // Auth guard
  if (!session && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth/login"
    redirectUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Force overrides for testing
  const force = searchParams.get("force")
  if (force === "mobile") {
    if (!isMobilePath(pathname) && !pathname.startsWith("/auth") && !pathname.startsWith("/api")) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = `/m${pathname}`
      return NextResponse.redirect(redirectUrl)
    }
    return response
  }
  if (force === "desktop") {
    if (isMobilePath(pathname)) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/m/, "") || "/"
      return NextResponse.redirect(redirectUrl)
    }
    return response
  }

  // UA-based routing
  const ua = request.headers.get("user-agent")
  const mobile = isMobileUA(ua)

  if (mobile && !isMobilePath(pathname) && !pathname.startsWith("/auth") && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = `/m${pathname}`
    return NextResponse.redirect(redirectUrl)
  }

  if (!mobile && isMobilePath(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = pathname.replace(/^\/m/, "") || "/"
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
