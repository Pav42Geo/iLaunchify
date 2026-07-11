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
import { PartnerCenterNav } from './PartnerCenterNav'

export async function PartnerTopbar({
  user,
  companyName,
  tier = null,
  showMyApplication = false,
  poolEligible = false,
}: {
  user: User
  companyName: string
  /** Partner subscription tier — rendered as an info-only chip in the menu. */
  tier?: 'VERIFIED' | 'TRUSTED' | 'PREMIER' | null
  /** True while the partner is pre-activation (menu shows "My application"). */
  showMyApplication?: boolean
  /** Eligible to see the Co-Creation Opportunity Pool → shows the third header icon. */
  poolEligible?: boolean
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
      // Facebook-style icon cluster (absolutely centered, mirrors admin) plus
      // the guided-builder portal target. The product builder injects its Saved
      // chip + Save Draft into gb-topbar-center (display:contents keeps them in
      // normal flow); the icon nav hides itself while the builder is active.
      center={
        <div className="relative flex flex-1 items-center">
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
            <div className="pointer-events-auto">
              <PartnerCenterNav poolEligible={poolEligible} />
            </div>
          </div>
          <div id="gb-topbar-center" style={{ display: 'contents' }} />
        </div>
      }
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
