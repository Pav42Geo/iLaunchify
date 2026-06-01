// Admin sidebar v3 — sectioned + collapsible + badge-aware.
//
// SERVER component. Loads badge counts once per render and threads them
// into the client-side collapsible tree. The actual tree-render component
// (AdminSidebarTree) is a tiny client island that owns localStorage
// open/closed state per section.

import { loadSidebarBadges } from './sidebar-badges'
import { SIDEBAR_REGIONS } from './sidebar-config'
import { AdminSidebarTree } from './AdminSidebarTree'

export async function AdminSidebar() {
  const badges = await loadSidebarBadges()
  return <AdminSidebarTree regions={SIDEBAR_REGIONS} badges={badges} />
}
