// Partner dashboard topbar (REBUILD R1).
//
// Visually identical to the marketplace + creator dashboard headers: white
// sticky bar, pink-square logo on the left, notification bell + user
// dropdown on the right. Partner-specific touches: ink-900 avatar (vs the
// creator's pink), companyName as the dropdown headline.

import type { User } from '@ilaunchify/auth'
import { AppHeader, Brand, BrandMark } from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { PartnerTopbarRight } from './PartnerTopbarRight'
import { CoCreationSublabel } from './CoCreationTopbarSlots'

export async function PartnerTopbar({
  user,
  companyName,
  tier = null,
  showMyApplication = false,
}: {
  user: User
  companyName: string
  /** Partner subscription tier — rendered as an info-only chip in the menu. */
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
  /** True while the partner is pre-activation (menu shows "My application"). */
  showMyApplication?: boolean
}) {
  const [logos, placement] = await Promise.all([getPublicBrandLogos(), getLogoPlacement('partnerHeader')])
  const brand =
    placement.kind === 'mark' ? (
      <BrandMark imageSrc={logos.markLight} sublabel={placement.sublabel} />
    ) : (
      <Brand imageSrc={logos.fullLight} sublabel={placement.sublabel ?? undefined} />
    )
  return (
    <AppHeader
      brandHref="/dashboard"
      flushLeft
      // Co-creation routes append the demo's "| Co-Creation Studio" sublabel
      // (route-aware client slot; no-op elsewhere).
      brand={
        <>
          {brand}
          <CoCreationSublabel />
        </>
      }
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
            // Placeholder avatar until real profile-image upload lands.
            image={user.image ?? 'https://i.pravatar.cc/120?img=12'}
            companyName={companyName}
            tier={tier}
            showMyApplication={showMyApplication}
          />
        </>
      }
    />
  )
}
