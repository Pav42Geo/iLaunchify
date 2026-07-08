// POST /api/auth/signup — creator signup endpoint
//
// Creates a User (role=CREATOR) + CreatorProfile row in one transaction,
// then triggers the magic-link email (or returns the dev fallback URL).
//
// Body shape:
//   {
//     name: string,
//     email: string,
//     brandName?: string   // optional — can be added later in onboarding Step 1
//   }
//
// The Brand row itself is NOT created here — that happens during onboarding
// Step 1 when the creator picks target markets + operating region + brand name.
// Per docs/CREATOR_ONBOARDING.md §Step 1.
//
// Returns 200 on success (next step = check email), 400 on validation,
// 409 if email taken, 500 on DB error.

import { NextRequest, NextResponse } from 'next/server'
import { createUserWithRole } from '@ilaunchify/auth'
import { signIn } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT', message: 'Bad JSON body.' }, { status: 400 })
  }

  const data = body as {
    name?: string
    email?: string
    brandName?: string
    launch?: Record<string, string>
  }

  if (!data.name || !data.email) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', message: 'Name and email are required.' },
      { status: 400 },
    )
  }

  // If the visitor arrived from a marketplace product pick, resume the launch
  // into the Design Studio right after sign-in (the launch route lazily ensures
  // a brand, so no brand setup is required first). Otherwise land on onboarding.
  // Same-origin relative path only — safe as an Auth.js callbackUrl.
  const callbackUrl = buildPostSigninUrl(data.launch)

  const result = await createUserWithRole({
    role: 'CREATOR',
    name: data.name,
    email: data.email,
    brandName: data.brandName,
  })

  if (!result.ok) {
    const statusCode = result.error === 'EMAIL_TAKEN' ? 409 : 400
    return NextResponse.json({ error: result.error, message: result.message }, { status: statusCode })
  }

  const hasResend = !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM)

  if (hasResend) {
    try {
      await signIn('resend', {
        email: result.email,
        redirect: false,
        callbackUrl,
      })
      return NextResponse.json({ ok: true, userId: result.userId, nextStep: 'CHECK_EMAIL' })
    } catch (err) {
      return NextResponse.json({
        ok: true,
        userId: result.userId,
        nextStep: 'CHECK_EMAIL',
        warning: 'Account created but email delivery may have failed. Try the sign-in page if you don\'t receive the link.',
      })
    }
  }

  // Dev fallback
  const devUrl = `/api/dev/login?email=${encodeURIComponent(result.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`
  return NextResponse.json({ ok: true, userId: result.userId, nextStep: 'DEV_REDIRECT', devUrl })
}

/** Whitelisted launch keys carried from the marketplace pick. */
const LAUNCH_KEYS = ['template', 'flavor', 'size', 'packaging', 'quantity', 'partnerOfferingId'] as const

/**
 * Where to send the user after their first sign-in. When a marketplace product
 * pick is present, resume the launch via /api/launch-after-signin (which creates
 * the product + opens the Studio); otherwise go to onboarding. Returns a
 * same-origin relative path so it's a valid Auth.js callbackUrl.
 */
function buildPostSigninUrl(launch: Record<string, string> | undefined): string {
  const template = launch?.template
  // No marketplace pick → land on the dashboard, where the first-run GetStartedHub
  // + Launch Checklist drawer live. (Was '/dashboard/creator/onboarding', a route
  // that no longer exists after the stepper→checklist-drawer pivot — 404. 2026-07-07.)
  if (!template) return '/dashboard'
  const params = new URLSearchParams()
  for (const key of LAUNCH_KEYS) {
    const value = launch?.[key]
    if (value) params.set(key, value)
  }
  return `/api/launch-after-signin?${params.toString()}`
}
