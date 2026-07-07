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
import { Bookmark, Bell } from 'lucide-react'
import {
  AppHeader,
  AppHeaderGuestCta,
  AppHeaderIconButton,
  AppHeaderSubnavStrip,
  Brand as BrandLockup,
  BrandMark,
} from '@ilaunchify/ui'
import { getPublicBrandLogos, getLogoPlacement, type LogoPlacementKey } from '@ilaunchify/db'
import { UserMenu, type UserMenuProps } from './UserMenu'
// BrandSwitcher RETIRED (Pavel 2026-07-06) — brand access lives in the menu.
// Shape kept for the header props API (callers still pass brand lists).
interface Brand {
  id: string
  name: string
  colorHex: string
}
import { MarketplaceSearchBar } from './MarketplaceSearchBar'
import { MarketplaceCommandPalette } from './MarketplaceCommandPalette'
import { CategoriesMegaMenu } from './CategoriesMegaMenu'
import { creatorUrl } from '@/lib/app-urls'
import { NICHES } from '@/lib/niches'

/**
 * Minimum niche shape the subnav strip needs. Both the hardcoded
 * `niches.ts` entry and the DB-driven `MarketplaceNiche` (Slice 2B)
 * satisfy this — the consumer chooses which one to pass.
 */
export interface MarketplaceHeaderNiche {
  slug: string
  name: string
}

export interface MarketplaceHeaderProps {
  /** Which logo-placement config to read (default the marketplace header; the
   *  Academy passes 'creatorAcademy' for its own logo + sublabel). */
  placementKey?: LogoPlacementKey
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
  /**
   * Niche tabs rendered in the subnav. When omitted, falls back to the
   * locked hardcoded `NICHES` list so legacy callers (and any caller
   * that doesn't need fresh DB data) keep working. Pages that already
   * fetch niches (e.g. /marketplace via loadActiveNiches) should pass
   * the DB-loaded array to avoid double-fetching.
   */
  niches?: ReadonlyArray<MarketplaceHeaderNiche>
}

export async function MarketplaceHeader({
  user,
  hasUnreadNotifications = false,
  brands = [],
  activeBrandId,
  activeNiche,
  niches = NICHES,
  placementKey = 'marketplaceHeader',
}: MarketplaceHeaderProps = {}) {
  const isGuest = !user
  const [logos, placement] = await Promise.all([getPublicBrandLogos(), getLogoPlacement(placementKey)])
  const brand =
    placement.kind === 'mark' ? (
      <BrandMark imageSrc={logos.markLight} sublabel={placement.sublabel} />
    ) : (
      <BrandLockup imageSrc={logos.fullLight} sublabel={placement.sublabel ?? undefined} />
    )

  return (
    <AppHeader
      flushLeft
      brand={brand}
      center={
        // The 'All Categories' button moved out of the header centre into
        // the niche subnav (as a hamburger trigger that opens the mega
        // menu). The centre slot holds the search bar; the ⌘K command
        // palette mounts here too (renders nothing until opened).
        <>
          <MarketplaceSearchBar />
          <MarketplaceCommandPalette />
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
            <a href={creatorUrl('/favorites')} aria-label="Favorites" className="inline-flex">
              <AppHeaderIconButton aria-label="Favorites" tabIndex={-1}>
                <Bookmark strokeWidth={2} className="h-5 w-5" />
              </AppHeaderIconButton>
            </a>
            <AppHeaderIconButton
              aria-label="Notifications"
              hasDot={hasUnreadNotifications}
            >
              <Bell strokeWidth={2} className="h-5 w-5" />
            </AppHeaderIconButton>
            <UserMenu user={user!} />
          </>
        )
      }
      subnav={
        // Hamburger mega-menu trigger sits flush-left, followed by the
        // niche tab strip. Both share the same horizontal track inside
        // AppHeaderSubnavStrip's scroll container.
        <AppHeaderSubnavStrip flushLeft>
          <CategoriesMegaMenu />
          {niches.map((n) => {
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
