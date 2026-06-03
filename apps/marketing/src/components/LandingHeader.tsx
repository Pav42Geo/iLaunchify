// LandingHeader — slim composition over the shared AppHeader primitive
// (REBUILD R1). Marketing surfaces that aren't actively browsing templates:
// home, /how-it-works, /pricing, /contact-sales.
//
// Differs from MarketplaceHeader by:
//   - dropping the "All Categories" button + search bar
//   - swapping in the "For creators" / "For partners" centre nav dropdowns
//   - dropping the niche subnav row

import {
  AppHeader,
  AppHeaderGuestCta,
  AppHeaderIconButton,
} from '@ilaunchify/ui'
import Link from 'next/link'
import { Heart, Bell } from 'lucide-react'
import { UserMenu, type UserMenuProps } from './UserMenu'
import { BrandSwitcher, type Brand } from './BrandSwitcher'
import { LandingNavDropdown } from './LandingNavDropdown'
import { creatorUrl, partnerUrl } from '@/lib/app-urls'

export interface LandingHeaderProps {
  user?: UserMenuProps['user'] | null
  hasUnreadNotifications?: boolean
  brands?: Brand[]
  activeBrandId?: string
}

export function LandingHeader({
  user,
  hasUnreadNotifications = false,
  brands = [],
  activeBrandId,
}: LandingHeaderProps = {}) {
  const isGuest = !user

  return (
    <AppHeader
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
                label: 'Talk to sales',
                href: '/contact-sales',
                description: 'Agency-tier onboarding for multi-brand operators.',
              },
            ]}
          />

          <LandingNavDropdown
            label="For partners"
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
    />
  )
}
