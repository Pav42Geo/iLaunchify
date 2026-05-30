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
import { CategoriesMegaMenu } from './CategoriesMegaMenu'
import { creatorUrl } from '@/lib/app-urls'
import { NICHES } from '@/lib/niches'

export interface MarketplaceHeaderProps {
  /** When omitted/null, the header renders the guest variant. */
  user?: UserMenuProps['user'] | null
  /** Notification dot indicator — only meaningful when `user` is set. */
  hasUnreadNotifications?: boolean
  /** All brands the creator owns. Drives the top-nav brand switcher. */
  brands?: Brand[]
  /** Currently-active brand id (must match one of `brands[*].id`). */
  activeBrandId?: string
  /**
   * Slug of the niche the visitor is currently in — drives the pink
   * underline on the subnav tab. Pass from the consuming page:
   *   - /launch/[niche]       → params.niche
   *   - /marketplace?niche=X  → searchParams.niche
   * Anywhere else (browse landing, category, template detail) leave
   * undefined so no tab is highlighted.
   */
  activeNiche?: string
}

export function MarketplaceHeader({
  user,
  hasUnreadNotifications = false,
  brands = [],
  activeBrandId,
  activeNiche,
}: MarketplaceHeaderProps = {}) {
  const isGuest = !user

  return (
    <AppHeader
      center={
        // The 'All Categories' button moved out of the header centre into
        // the niche subnav (as a hamburger trigger that opens the mega
        // menu). The centre slot now holds the search bar alone.
        <MarketplaceSearchBar />
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
        // Hamburger mega-menu trigger sits flush-left, followed by the
        // niche tab strip. Both share the same horizontal track inside
        // AppHeaderSubnavStrip's scroll container.
        <AppHeaderSubnavStrip>
          <CategoriesMegaMenu />
          {NICHES.map((n) => {
            const isActive = activeNiche === n.slug
            return (
              <Link
                key={n.slug}
                href={`/launch/${n.slug}`}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'whitespace-nowrap border-b-2 px-3 py-[11px] text-[13px] font-medium transition-colors ' +
                  (isActive
                    ? 'border-pink-500 font-semibold text-pink-700'
                    : // Hover: lighter pink underline so it's clearly a "click
                      // to activate" affordance without competing with the
                      // pink-500 underline used for the truly active tab.
                      'border-transparent text-ink-600 hover:border-pink-300 hover:text-pink-700')
                }
              >
                {n.name}
              </Link>
            )
          })}
        </AppHeaderSubnavStrip>
      }
    />
  )
}
