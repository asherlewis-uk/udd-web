import { NextResponse } from 'next/server'

/**
 * Container healthcheck endpoint.
 *
 * Intentionally cheap: no DB roundtrip, no auth check, no external call.
 * Its job is to prove the Node process is alive and the Next.js router is
 * serving — which is what Docker's HEALTHCHECK actually needs to know.
 *
 * If we ever want a deeper "is the database reachable" probe, add a
 * separate /api/ready route and have the orchestrator gate traffic on
 * that one instead.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
