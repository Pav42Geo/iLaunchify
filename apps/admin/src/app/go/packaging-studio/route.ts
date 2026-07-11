// Admin → Packaging Studio surface authoring bridge (ADMIN_PACKAGING_STUDIO.md P2).
// The authoring canvas lives in the creator app (:3000). This endpoint verifies the
// admin capability, then redirects there — hopping through the creator dev-login in dev
// so the :3000 session is established automatically (same pattern as /go/design-studio).
// Carries ?packagingTypeId through to /studio/packaging.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireCapability } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireCapability('catalog:write')

  const base = process.env.NEXT_PUBLIC_CREATOR_URL ?? 'http://localhost:3000'
  // Only hop through creator dev-login when it's enabled (H5 A0). Else → straight to dest.
  const useDevLogin =
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_LOGIN === 'true'
  const packagingTypeId = req.nextUrl.searchParams.get('packagingTypeId') ?? ''
  const dest = `/studio/packaging${packagingTypeId ? `?packagingTypeId=${encodeURIComponent(packagingTypeId)}` : ''}`

  const target =
    useDevLogin && user.email
      ? `${base}/api/dev/login?email=${encodeURIComponent(user.email)}&callbackUrl=${encodeURIComponent(dest)}`
      : `${base}${dest}`

  return NextResponse.redirect(target)
}
