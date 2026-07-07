// LandingHeader — slim composition over the shared AppHeader primitive
// (REBUILD R1). Marketing surfaces that aren't actively browsing templates:
// home, /how-it-works, /pricing, /contact-sales, /influencers.
//
// Differs from MarketplaceHeader by:
//   - dropping the "All Categories" button + search bar
//   - swapping in the "For creators" / "Business" / "Influencers" centre nav
//   - dropping the niche subnav row
//
// Naming note: "Business" is what we call the manufacturer-partner track in
// the public marketing nav (per Pavel 2026-06-03 rename from "For partners").
// The route stays at /business; only the label changes.

import {
  AppHeader,
  AppHeaderGuestCta,
  AppHeaderIconButton,
  Brand as BrandLockup,
  BrandMark,
} from '@ilaunchify/ui'
import Link from 'next/link'
import { Heart, Bell } from 'lucide-react'
import { getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { UserMenu, type UserMenuProps } from './UserMenu'
import { LandingNavDropdown } from './LandingNavDropdown'

// BrandSwitcher RETIRED (Pavel 2026-07-06) — brand access lives in the menu.
// Shape kept for the header props API (callers still pass brand lists).
interface Brand {
  id: string
  name: string
  colorHex: string
}
import { creatorUrl, partnerUrl } from '@/lib/app-urls'

export interface LandingHeaderProps {
  user?: UserMenuProps['user'] | null
  hasUnreadNotifications?: boolean
  brands?: Brand[]
  activeBrandId?: string
}

export async function LandingHeader({
  user,
  hasUnreadNotifications = false,
  brands = [],
  activeBrandId,
}: LandingHeaderProps = {}) {
  const isGuest = !user
  const [logos, placement] = await Promise.all([getPublicBrandLogos(), getLogoPlacement('marketingHeader')])
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
        <nav className="hidden items-center gap-7 md:flex">
          <Link
            href="/marketplace"
            className="py-1 text-[14px] font-medium text-ink-700 transition-colors hover:text-ink-900"
          >
            Marketplace
          </Link>

          <LandingNavDropdown
            label="For creators"
            href="/how-it-works"
            items={[
              {
                label: 'How it works',
                href: '/how-it-works',
                description: 'The four-step creator journey.',
              },
              {
                label: 'Pricing',
                href: '/pricing',
                description: 'Maker · Builder · Agency tiers + production-order fees.',
              },
              {
                label: 'Browse the marketplace',
                href: '/marketplace',
                description: 'Curated starter templates across 8 niches.',
              },
              {
                label: 'Academy',
                href: '/academy',
                description: 'Free courses to launch and grow your brand.',
              },
              {
                label: 'Talk to sales',
                href: '/contact-sales',
                description: 'Agency-tier onboarding for multi-brand operators.',
              },
            ]}
          />

          <LandingNavDropdown
            label="Business"
            href="/business"
            items={[
              {
                label: 'Why iLaunchify',
                href: '/business',
                description: 'Demand pipeline + structured workflow + Stripe Connect payouts.',
              },
              {
                label: 'Partner network',
                href: '/business#tiers',
                description: '4 service types · 5-layer onboarding.',
              },
              {
                label: 'Partner Academy',
                href: '/business/academy',
                description: 'Training for manufacturing + fulfillment partners.',
              },
              {
                label: 'Apply to join',
                href: partnerUrl('/signup'),
                description: '~25 minutes if you have your docs ready.',
              },
              {
                label: 'Partner login',
                href: partnerUrl('/login'),
                description: 'Already approved? Sign in.',
              },
            ]}
          />

          <Link
            href="/influencers"
            className="py-1 text-[14px] font-medium text-ink-700 transition-colors hover:text-ink-900"
          >
            Influencers
          </Link>
        </nav>
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
                <Heart strokeWidth={2} className="h-5 w-5" />
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
    />
  )
}
