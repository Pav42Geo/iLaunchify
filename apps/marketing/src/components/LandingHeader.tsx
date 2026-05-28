import Link from 'next/link'
import { Heart, Bell } from 'lucide-react'
import { UserMenu, type UserMenuProps } from './UserMenu'
import { BrandSwitcher, type Brand } from './BrandSwitcher'
import { LandingNavDropdown } from './LandingNavDropdown'
import { creatorUrl, partnerUrl } from '@/lib/app-urls'

/**
 * LandingHeader — slim white header for marketing surfaces.
 *
 * Differs from MarketplaceHeader (which is browse-focused) by dropping the
 * "All Categories" dropdown, the search bar, and the niche subnav row.
 * This is the header for / (home), and could be reused for /how-it-works,
 * /pricing, /contact-sales — anywhere the user isn't actively browsing
 * templates.
 *
 * Auth-aware in the same way as MarketplaceHeader:
 *   - Guest → Sign in link + black-pill Start launching CTA
 *   - User  → Heart + Bell + BrandSwitcher + UserMenu dropdown
 */
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
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-b border-ink-200">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-3.5 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-[7px] flex-shrink-0">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-[23px] font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          <Link
            href="/marketplace"
            className="text-[14px] font-medium text-ink-700 hover:text-ink-900 transition-colors py-1"
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
                description: 'Maker · Builder · Agency tiers.',
              },
              {
                label: 'Browse the marketplace',
                href: '/marketplace',
                description: '200+ production-ready templates.',
              },
              {
                label: 'Talk to sales',
                href: '/contact-sales',
                description: 'Multi-brand operators + agencies.',
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
                description: 'The partner-side value proposition.',
              },
              {
                label: 'Partner tiers',
                href: '/business#tiers',
                description: 'Verified → Trusted → Premier.',
              },
              {
                label: 'Apply to join',
                href: partnerUrl('/signup'),
                description: 'Start the 5-layer onboarding.',
              },
              {
                label: 'Partner login',
                href: partnerUrl('/login'),
                description: 'Already approved? Sign in.',
              },
            ]}
          />
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-shrink-0">
          {isGuest ? (
            <>
              <a
                href={creatorUrl('/login')}
                className="text-sm font-semibold text-ink-700 hover:text-ink-900 px-3 py-2 transition-colors"
              >
                Sign in
              </a>
              <a
                href={creatorUrl('/signup')}
                className="inline-flex items-center gap-[7px] bg-ink-900 text-white font-semibold text-sm px-[22px] py-[11px] rounded-pill transition-all hover:bg-black hover:-translate-y-px"
              >
                Start launching
              </a>
            </>
          ) : (
            <>
              <IconButton aria-label="Favorites">
                <Heart strokeWidth={2} className="w-5 h-5" />
              </IconButton>
              <IconButton aria-label="Notifications" hasDot={hasUnreadNotifications}>
                <Bell strokeWidth={2} className="w-5 h-5" />
              </IconButton>
              {brands.length > 1 && activeBrandId && (
                <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
              )}
              <UserMenu user={user!} />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function IconButton({
  children,
  hasDot,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { hasDot?: boolean }) {
  return (
    <button
      type="button"
      className="relative w-10 h-10 rounded-md flex items-center justify-center text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
      {...props}
    >
      {children}
      {hasDot && (
        <span className="absolute top-2 right-[9px] w-[7px] h-[7px] rounded-full bg-pink-500 border-[1.5px] border-white" />
      )}
    </button>
  )
}
