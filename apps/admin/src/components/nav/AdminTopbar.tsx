// Admin dashboard topbar (REBUILD R1).
//
// Same shared chrome as creator + partner dashboards via the AppHeader
// primitive in @ilaunchify/ui. Admin-specific bits: no Heart, no
// BrandSwitcher, ink-900 avatar.

import type { User } from '@ilaunchify/auth'
import { AppHeader } from '@ilaunchify/ui'
import { AdminTopbarRight } from './AdminTopbarRight'

export function AdminTopbar({ user }: { user: User }) {
  return (
    <AppHeader
      brandHref="/dashboard"
      right={<AdminTopbarRight email={user.email} name={user.name ?? null} />}
    />
  )
}
