// Admin dashboard topbar (REBUILD R1).
//
// Same shared chrome as creator + partner dashboards via the AppHeader
// primitive in @ilaunchify/ui. Admin-specific bits: no Heart, no
// BrandSwitcher, ink-900 avatar.

import type { User } from '@ilaunchify/auth'
import { AppHeader, Brand, BrandMark } from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { AdminTopbarRight } from './AdminTopbarRight'
import { AdminCenterNav } from './AdminCenterNav'

export async function AdminTopbar({ user }: { user: User }) {
  const [logos, placement] = await Promise.all([getPublicBrandLogos(), getLogoPlacement('adminHeader')])
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
      brand={brand}
      center={
        // Facebook-style center cluster: Home / Marketplace / Design Studio
        // (large graphic-grey icons with active pink underline). Sits inside
        // a flex-1 wrapper so the three tabs visually centre between the
        // brand mark and the right cluster.
        <div className="flex flex-1 justify-center">
          <AdminCenterNav />
        </div>
      }
      right={
        <AdminTopbarRight
          email={user.email}
          name={user.name ?? null}
          // Placeholder avatar until real profile-image upload lands.
          image={user.image ?? 'https://i.pravatar.cc/120?img=68'}
        />
      }
    />
  )
}
