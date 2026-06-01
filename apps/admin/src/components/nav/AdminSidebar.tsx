// Admin sidebar v3 — sectioned + collapsible + badge-aware.
//
// SERVER component. Loads badge counts once per render and hands them
// (and nothing else) to the client-side collapsible tree. The tree
// reads SIDEBAR_REGIONS directly — passing the config across the
// server→client boundary would attempt to serialize the Lucide icon
// component references, which React 19 / Next 15 rejects with
// "Functions cannot be passed directly to Client Components".
//
// Keep `badges` as the ONLY serializable payload that crosses the
// boundary (it's a plain Record<string, number>).

import { loadSidebarBadges } from './sidebar-badges'
import { AdminSidebarTree } from './AdminSidebarTree'

export async function AdminSidebar() {
  const badges = await loadSidebarBadges()
  return <AdminSidebarTree badges={badges} />
}
