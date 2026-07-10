// =============================================================================
// /admin/briefs — MOVED to /product-builder?view=briefs (Pavel 2026-07-10)
// =============================================================================
//
// The briefs list now renders as the "Briefs" tab of the Product Builder page
// (one top-level APPLICATIONS nav item). The list body lives in
// ./BriefsListSection.tsx; the detail route /briefs/[briefId] stays here
// (deep-linked from row actions, notifications, and cross-links).

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function BriefsPage() {
  redirect('/product-builder?view=briefs')
}
