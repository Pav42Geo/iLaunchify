'use client'

// Right cluster for the creator dashboard topbar (REBUILD R1.3 · menu v2
// 2026-07-06, docs/ACCOUNT_MENUS_PROPOSAL.md).
//
// Heart · Notifications bell · AppHeaderUserMenu v2 with tier-aware brand
// cards. (The standalone topbar BrandSwitcher was RETIRED — Pavel 2026-07-06;
// the menu's brand cards are the one switching surface.)
//
// Menu contract (Pavel 2026-07-06): identity + brand cards + ONE work
// shortcut (Orders) + account section. The sidebar owns the rest of nav —
// don't add rows back without a decision.

import { AppHeaderIconButton, AppHeaderUserMenu } from '@ilaunchify/ui'
import {
  Bookmark,
  ShoppingBag,
  Plug,
  CreditCard,
  Crown,
  Bell,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export interface BrandOption {
  id: string
  name: string
  handle: string
}

interface Props {
  email: string
  name: string | null
  brands: BrandOption[]
  activeBrandId: string
  /** @deprecated — the live NotificationBell polls its own unread count. */
  hasUnreadNotifications?: boolean
  tier?: 'maker' | 'builder' | 'agency' | null
  /** Brand-kit cap for the tier (BRAND_LIMITS[tier].kits). Infinity-safe:
      pass Number.POSITIVE_INFINITY for agency. */
  brandCap?: number
  /** Saved-favorites count for the header badge (docs/FAVORITES_MANAGEMENT.md). */
  favoritesCount?: number
}

// Same cookie the BrandSwitcher writes — brand-scoped server components
// re-read it after router.refresh().
const COOKIE_NAME = 'active_brand_id'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function TopbarRight({
  email,
  name,
  brands,
  activeBrandId,
  tier = null,
  brandCap,
  favoritesCount = 0,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function switchBrand(brandId: string) {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(brandId)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
    startTransition(() => router.refresh())
  }

  const cap = brandCap ?? (tier === 'maker' ? 1 : tier === 'builder' ? 3 : Infinity)
  const atCap = brands.length >= cap

  return (
    <>
      <span className="relative inline-flex">
        <AppHeaderIconButton
          aria-label={favoritesCount > 0 ? `Favorites (${favoritesCount} saved)` : 'Favorites'}
          onClick={() => router.push('/favorites')}
        >
          <Bookmark strokeWidth={2} className="h-5 w-5" />
        </AppHeaderIconButton>
        {favoritesCount > 0 && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
            {favoritesCount > 9 ? '9+' : favoritesCount}
          </span>
        )}
      </span>
      <NotificationBell />
      <AppHeaderUserMenu
        user={{ name, email, tier }}
        tierLabels={{ maker: 'Maker', builder: 'Builder', agency: 'Agency' }}
        manageTierHref="/settings/plan"
        avatarTone="pink"
        brandCards={{
          brands,
          activeBrandId,
          onSelect: switchBrand,
          manageHref: (id) => `/brands/${id}`,
          viewAllHref: '/brands',
          // Under cap → Add brand; Maker at cap → upgrade nudge.
          ...(atCap
            ? tier === 'maker'
              ? {
                  upgradeNudge: {
                    text: 'Want another brand?',
                    cta: 'Upgrade to Builder →',
                    href: '/settings/plan',
                  },
                }
              : {}
            : { addBrandHref: '/brands/new' }),
        }}
        sections={[
          {
            items: [
              // The ONE work shortcut (Pavel 2026-07-06) — sidebar owns the rest.
              { label: 'Orders', href: '/orders', icon: ShoppingBag },
            ],
          },
          {
            label: 'Account',
            items: [
              { label: 'Plan & billing', href: '/settings/plan', icon: Crown },
              { label: 'Payments', href: '/settings/payouts', icon: CreditCard },
              { label: 'Channels', href: '/channels', icon: Plug },
              { label: 'Notifications', href: '/settings/notifications', icon: Bell },
              { label: 'Settings', href: '/settings', icon: Settings },
            ],
          },
          {
            items: [
              { label: 'Help & support', href: '/help', icon: HelpCircle },
            ],
          },
        ]}
        onSignOut={() => signOut({ callbackUrl: '/login' })}
      />
    </>
  )
}
