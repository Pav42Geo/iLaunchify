// Partner dashboard topbar (REBUILD R1).
//
// Visually identical to the marketplace + creator dashboard headers: white
// sticky bar, pink-square logo on the left, notification bell + user
// dropdown on the right. Partner-specific touches: ink-900 avatar (vs the
// creator's pink), companyName as the dropdown headline.

import type { User } from '@ilaunchify/auth'
import { AppHeader } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { PartnerTopbarRight } from './PartnerTopbarRight'

export async function PartnerTopbar({
  user,
  companyName,
}: {
  user: User
  companyName: string
}) {
  const logos = await getPublicBrandLogos()
  return (
    <AppHeader
      brandHref="/dashboard"
      flushLeft
      logoSrc={logos.fullLight}
      // Empty portal targets the product builder injects its Saved chip + Save
      // Draft (center, next to the logo) and Next button (right, next to the
      // bell) into. Harmless on every other page.
      center={<div id="gb-topbar-center" style={{ display: 'contents' }} />}
      right={
        <>
          <div id="gb-topbar-right" style={{ display: 'contents' }} />
          <PartnerTopbarRight
            email={user.email}
            name={user.name ?? null}
            companyName={companyName}
          />
        </>
      }
    />
  )
}
