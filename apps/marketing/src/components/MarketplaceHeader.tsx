import Link from 'next/link'
import { Search, Heart, Bell } from 'lucide-react'
import { UserMenu, type UserMenuProps } from './UserMenu'
import { BrandSwitcher, type Brand } from './BrandSwitcher'
import { creatorUrl } from '@/lib/app-urls'

/**
 * MarketplaceHeader — the white-header Option C Hybrid for creator surfaces.
 *
 * Locked rule (DESIGN_SYSTEM.md §1): the header color is the audience-signal.
 * Creator marketplace = WHITE. Never put a dark header on a creator surface.
 *
 * Auth-aware:
 *   - Guest  → "Sign in" link + "Start launching" CTA. No bell/heart.
 *   - User   → bell + heart + UserMenu dropdown. CTA hidden (the dropdown's
 *              Dashboard / My products links replace it for logged-in users).
 *
 * The cart icon was removed — this is a B2B production marketplace, not a
 * consumer storefront (per [[ilaunchify-business-model]]). End-buyer carts
 * live on each brand's own DTC/wholesale channel, never on iLaunchify.
 *
 * V1: `user` is passed as a prop. Real session reading lands when
 * @ilaunchify/auth is wired into apps/marketing (next pass).
 */
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
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-b border-ink-200">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-5">
        <Link href="/" className="flex items-center gap-[7px] flex-shrink-0">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-[23px] font-extrabold tracking-[-0.04em] text-ink-900">
            iLaunchify
          </span>
        </Link>

        <button
          type="button"
          className="inline-flex items-center gap-[7px] font-semibold text-sm px-3.5 py-2.5 rounded-md bg-ink-100 text-ink-900 hover:bg-ink-200 transition-colors flex-shrink-0"
        >
          All Categories <span className="text-[11px] text-ink-500">▼</span>
        </button>

        <div className="flex-1 relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-400"
            strokeWidth={2}
          />
          <input
            type="search"
            placeholder="Search recipes, templates, niches…"
            className="w-full h-[42px] pl-10 pr-4 text-sm bg-white border border-ink-300 rounded-pill text-ink-900 placeholder:text-ink-500 focus:outline-none focus:border-pink-500 focus:ring-[3px] focus:ring-pink-500/15 transition-[border-color,box-shadow]"
          />
        </div>

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

      <nav className="border-t border-ink-100 bg-white/60">
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1 overflow-x-auto">
          {NICHES.map((n) => (
            <Link
              key={n.slug}
              href={`/launch/${n.slug}`}
              className={
                'px-3 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (n.active
                  ? 'text-pink-700 border-pink-500 font-semibold'
                  : 'text-ink-600 border-transparent hover:text-ink-900')
              }
            >
              {n.name}
            </Link>
          ))}
        </div>
      </nav>
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
