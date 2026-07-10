// =============================================================================
// /admin/rooms — MOVED to /product-builder?view=rooms (Pavel 2026-07-10)
// =============================================================================
//
// The rooms list now renders as the "Rooms" tab of the Product Builder page
// (one top-level APPLICATIONS nav item). The list body lives in
// ./RoomsListSection.tsx; the detail route /rooms/[roomId] stays here
// (deep-linked from row actions, notifications, and cross-links).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function RoomsPage() {
  redirect('/product-builder?view=rooms')
}
