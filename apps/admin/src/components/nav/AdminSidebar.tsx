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

import { getViewerCapabilities } from '@ilaunchify/auth'
import { loadSidebarBadges } from './sidebar-badges'
import { AdminSidebarTree } from './AdminSidebarTree'

export async function AdminSidebar() {
  const [badges, capabilities] = await Promise.all([
    loadSidebarBadges(),
    getViewerCapabilities(),
  ])
  // capabilities is a plain string[] — safe to cross the server→client boundary
  // (unlike the Lucide icon refs in the config, which the tree reads directly).
  return <AdminSidebarTree badges={badges} capabilities={capabilities} />
}
