// Admin → Die-line Curation bridge. Curation is a canvas (Fabric) surface in the Design
// Studio (creator app, :3000). This endpoint verifies the admin capability, then redirects
// there — hopping through the creator dev-login in dev so the :3000 session is established
// automatically (same pattern as /go/design-studio and /go/packaging-studio).

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireCapability } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireCapability('catalog:write')

  const base = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'
  const isDev = process.env.NODE_ENV !== 'production'
  const dest = '/studio/dielines'

  const target =
    isDev && user.email
      ? `${base}/api/dev/login?email=${encodeURIComponent(user.email)}&callbackUrl=${encodeURIComponent(dest)}`
      : `${base}${dest}`

  return NextResponse.redirect(target)
}
