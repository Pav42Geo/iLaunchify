// MarketplaceHeader — thin composition over the shared AppHeader primitive
// (REBUILD R1). Adds the marketplace-specific bits:
//   - "All Categories" button + MarketplaceSearchBar in the centre
//   - Niche tab strip as bottom subnav
//   - Heart / Bell / BrandSwitcher / UserMenu in the right cluster
//
// Auth-aware:
//   - Guest  → "Sign in" link + "Start launching" CTA. No bell/heart.
//   - User   → bell + heart + UserMenu dropdown. CTA hidden (the dropdown's
//              Dashboard / My products links replace it for logged-in users).
//
// The cart icon was removed — this is a B2B production marketplace, not a
// consumer storefront (per [[ilaunchify-business-model]]). End-buyer carts
// live on each brand's own DTC/wholesale channel, never on iLaunchify.
//
// V1: `user` is passed as a prop. Real session reading lands when
// @ilaunchify/auth is wired into apps/marketing (REBUILD R2).

import Link from 'next/link'
import { Heart, Bell } from 'lucide-react'
import {
  AppHeader,
  AppHeaderGuestCta,
  AppHeaderIconButton,
  AppHeaderSubnavStrip,
} from '@ilaunchify/ui'
import { UserMenu, type UserMenuProps } from './UserMenu'
import { BrandSwitcher, type Brand } from './BrandSwitcher'
import { MarketplaceSearchBar } from './MarketplaceSearchBar'
import { creatorUrl } from '@/lib/app-urls'

export interface MarketplaceHeaderProps {
  /** When omitted/null, the header renders the guest variant. */
  user?: UserMenuProps['user'] | null
  /** Notification dot indicator — only meaningful when `user` is set. */
  hasUnreadNotifications?: boolean
  /** All brands the creator owns. Drives the top-nav brand switcher. */
  brands?: Brand[]
  /** Currently-active brand id (must match one of `brands[*].id`). */
  activeBrandId?: string
}

export function MarketplaceHeader({
  user,
  hasUnreadNotifications = false,
  brands = [],
  activeBrandId,
}: MarketplaceHeaderProps = {}) {
  const isGuest = !user

  return (
    <AppHeader
      center={
        <>
          <button
            type="button"
            className="inline-flex flex-shrink-0 items-center gap-[7px] rounded-md bg-ink-100 px-3.5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-200"
          >
            All Categories <span className="text-[11px] text-ink-500">▼</span>
          </button>
          <MarketplaceSearchBar />
        </>
      }
      right={
        isGuest ? (
          <AppHeaderGuestCta
            signInHref={creatorUrl('/login')}
            signUpHref={creatorUrl('/signup')}
          />
        ) : (
          <>
            <AppHeaderIconButton aria-label="Favorites">
              <Heart strokeWidth={2} className="h-5 w-5" />
            </AppHeaderIconButton>
            <AppHeaderIconButton
              aria-label="Notifications"
              hasDot={hasUnreadNotifications}
            >
              <Bell strokeWidth={2} className="h-5 w-5" />
            </AppHeaderIconButton>
            {brands.length > 1 && activeBrandId && (
              <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
            )}
            <UserMenu user={user!} />
          </>
        )
      }
      subnav={
        <AppHeaderSubnavStrip>
          {NICHES.map((n) => (
            <Link
              key={n.slug}
              href={`/launch/${n.slug}`}
              className={
                'whitespace-nowrap border-b-2 px-3 py-[11px] text-[13px] font-medium transition-colors ' +
                (n.active
                  ? 'border-pink-500 font-semibold text-pink-700'
                  : 'border-transparent text-ink-600 hover:text-ink-900')
              }
            >
              {n.name}
            </Link>
          ))}
        </AppHeaderSubnavStrip>
      }
    />
  )
}

const NICHES = [
  { slug: 'energy-performance', name: 'Energy & Performance', active: true },
  { slug: 'wellness', name: 'Wellness & Holistic Health', active: false },
  { slug: 'beauty', name: 'Beauty & Self-Care', active: false },
  { slug: 'healthy-lifestyle', name: 'Healthy Lifestyle', active: false },
  { slug: 'gourmet', name: 'Gourmet & Culinary', active: false },
  { slug: 'family-kids', name: 'Family & Kids', active: false },
  { slug: 'pet-wellness', name: 'Pet Wellness', active: false },
  { slug: 'social-lifestyle', name: 'Social & Lifestyle', active: false },
]
