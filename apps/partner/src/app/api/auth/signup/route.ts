// POST /api/auth/signup — partner signup endpoint
//
// Creates a User (role=PARTNER) + Partner (status=LEAD) row in one transaction,
// then triggers the magic-link email (or returns the dev fallback URL).
//
// Body shape:
//   {
//     name: string,
//     email: string,
//     companyName: string,    // required for partner
//     roleAtCompany?: string  // optional ("Operations Manager", "Founder", etc.)
//   }
//
// Returns 200 on success (next step = check email), 400 on validation,
// 409 if email taken, 500 on DB error.
//
// Spec: docs/PARTNER_ONBOARDING.md §1.3 (auth mechanics).

import { NextRequest, NextResponse } from 'next/server'
import { createUserWithRole, verifyTurnstile, requestIp } from '@ilaunchify/auth'
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
    companyName?: string
    roleAtCompany?: string
    turnstileToken?: string
  }

  if (!data.name || !data.email || !data.companyName) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', message: 'Name, email, and company name are required.' },
      { status: 400 },
    )
  }

  // Bot defense on the open signup form (H5 A4). Skips (allows) when Turnstile is
  // unconfigured; a bad/absent token when it IS configured → 403 before any DB write.
  const turnstile = await verifyTurnstile({ token: data.turnstileToken, ip: await requestIp() })
  if (!turnstile.ok) {
    return NextResponse.json(
      { error: 'TURNSTILE_FAILED', message: 'Verification failed — please retry.' },
      { status: 403 },
    )
  }

  const result = await createUserWithRole({
    role: 'PARTNER',
    name: data.name,
    email: data.email,
    companyName: data.companyName,
    roleAtCompany: data.roleAtCompany,
  })

  if (!result.ok) {
    const statusCode = result.error === 'EMAIL_TAKEN' ? 409 : 400
    return NextResponse.json({ error: result.error, message: result.message }, { status: statusCode })
  }

  // User + Partner rows now exist. Trigger magic link (production) or
  // signal the client to use the dev fallback (local development).
  const hasResend = !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM)

  if (hasResend) {
    try {
      await signIn('resend', {
        email: result.email,
        redirect: false,
        // After verification, land them on the partner onboarding wizard.
        callbackUrl: '/dashboard',
      })
      return NextResponse.json({
        ok: true,
        userId: result.userId,
        nextStep: 'CHECK_EMAIL',
      })
    } catch (err) {
      // Account was created, but email send failed — let the user know they
      // can still sign in via the magic-link form on /login.
      return NextResponse.json({
        ok: true,
        userId: result.userId,
        nextStep: 'CHECK_EMAIL',
        warning: 'Account created but email delivery may have failed. Try the sign-in page if you don\'t receive the link.',
      })
    }
  }

  // No email provider configured — do NOT silently forge a session via the dev
  // bypass. Surface the misconfig explicitly so it can't hide until prod. (H5 A1)
  return NextResponse.json(
    { ok: false, error: 'AUTH_NOT_CONFIGURED', message: 'Email sign-in is not configured.' },
    { status: 503 },
  )
}
