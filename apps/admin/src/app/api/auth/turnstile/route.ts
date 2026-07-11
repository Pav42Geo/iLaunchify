// POST /api/auth/turnstile — login-time Turnstile pre-check (H5 A4 §4).
//
// Admin login is already invite-only + TOTP; Turnstile here is defense-in-depth (P2).
// Magic-link sign-in runs through Auth.js signIn() client-side, so we verify the token
// BEFORE that, keeping the Auth.js flow untouched. The login form submits { token }
// here first and only calls signIn(...) on { ok: true }.
//
// Feature-gated in verifyTurnstile: with no TURNSTILE_SECRET_KEY it skips (ok:true), so
// unconfigured dev/preview logs in normally. Turnstile tokens are single-use — consumed
// exactly once here, then signIn proceeds.

import { NextRequest, NextResponse } from 'next/server'
import { verifyTurnstile, requestIp } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let token: string | null = null
  try {
    const body = (await req.json()) as { token?: string }
    token = body.token ?? null
  } catch {
    // no/invalid body → treated as a missing token (verify fails)
  }
  const result = await verifyTurnstile({ token, ip: await requestIp() })
  return NextResponse.json({ ok: result.ok }, { status: result.ok ? 200 : 403 })
}
