// RETIRED 2026-07-06 (SR-3) — the routing preview was absorbed into the
// unified Routing & Rotation control room (Manufacturers tab). The form
// component + action in this directory stay: /routing-rotation imports them.
// Old bookmarks land here and follow the redirect.

import { redirect } from 'next/navigation'

export default function RetiredRoutingPreviewPage() {
  redirect('/routing-rotation')
}
