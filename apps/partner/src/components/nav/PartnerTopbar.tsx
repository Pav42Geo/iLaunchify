// Partner dashboard topbar (REBUILD R1).
//
// Visually identical to the marketplace + creator dashboard headers: white
// sticky bar, pink-square logo on the left, notification bell + user
// dropdown on the right. Partner-specific touches: ink-900 avatar (vs the
// creator's pink), companyName as the dropdown headline.

import type { User } from '@ilaunchify/auth'
import { AppHeader } from '@ilaunchify/ui'
import { PartnerTopbarRight } from './PartnerTopbarRight'

export function PartnerTopbar({
  user,
  companyName,
}: {
  user: User
  companyName: string
}) {
  return (
    <AppHeader
      brandHref="/dashboard"
      right={
        <PartnerTopbarRight
          email={user.email}
          name={user.name ?? null}
          companyName={companyName}
        />
      }
    />
  )
}
