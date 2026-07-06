// Partner Routing & Dispatch RETIRED 2026-07-06 — folded into the unified
// Routing & Rotation control room (docs/SMART_ROTATION_ENGINE.md §2.3). Match
// weights now live on the Manufacturers tab; accept window / reroute cap /
// auto-cancel / changeover on the Dispatch lifecycle tab. This route redirects
// so old links + bookmarks land on the single source of truth (mirrors how
// /routing-preview was absorbed).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function RetiredPartnerRoutingPage() {
  redirect('/routing-rotation')
}
