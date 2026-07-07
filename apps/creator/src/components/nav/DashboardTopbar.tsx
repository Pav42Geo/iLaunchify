// Creator dashboard topbar (REBUILD R1).
//
// Visually identical to the marketplace header: white sticky bar with the
// pink-square logo on the left, the brand switcher + icon buttons + user
// dropdown on the right. No middle nav (the creator dashboard's primary
// nav lives in the left sidebar, not the topbar).
//
// Loads brand list + active-brand cookie server-side once per request so the
// client-side BrandSwitcher has everything it needs. Falls back to a thin
// shell if the user isn't a creator (admin or unauthenticated middleware
// misroute).

import { cookies } from 'next/headers'
import { prisma, getPublicBrandLogos, getLogoPlacement } from '@ilaunchify/db'
import { brandLimits, normalizeTier, type TierKey, type User } from '@ilaunchify/auth'
import { AppHeader, Brand, BrandMark } from '@ilaunchify/ui'
import { TopbarRight } from './TopbarRight'

const COOKIE_NAME = 'active_brand_id'

export async function DashboardTopbar({ user }: { user: User }) {
  // Load brands for the switcher. Admin users impersonating /creator
  // won't have a CreatorProfile — gracefully render the bare topbar.
  let brands: { id: string; name: string; handle: string }[] = []
  let tier: TierKey | null = null
  let favoritesCount = 0
  if (user.role === 'CREATOR') {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        subscriptionTier: true,
        brands: {
          select: { id: true, name: true, handle: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    brands = profile?.brands ?? []
    tier = profile ? normalizeTier(profile.subscriptionTier ?? null) : null
    // Favorites badge count — guarded on its own so a stale Prisma client
    // (before `db:push` + `db:generate` land the Favorite model, or before the
    // `.next` bundle refreshes) degrades to 0 instead of taking down the whole
    // dashboard. See CLAUDE.md stale-client gotcha.
    try {
      favoritesCount = await prisma.favorite.count({ where: { creator: { userId: user.id } } })
    } catch {
      favoritesCount = 0
    }
  }

  // Notification dot — check for any unread bell-channel notification.
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, channel: 'IN_APP', readAt: null },
  })

  const cookieStore = await cookies()
  const activeBrandIdCookie = cookieStore.get(COOKIE_NAME)?.value ?? ''
  const activeBrandId =
    brands.find((b) => b.id === activeBrandIdCookie)?.id ?? brands[0]?.id ?? ''

  const [logos, placement] = await Promise.all([getPublicBrandLogos(), getLogoPlacement('creatorHeader')])
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
      right={
        <TopbarRight
          email={user.email}
          name={user.name ?? null}
          // Placeholder avatar until real profile-image upload lands.
          image={user.image ?? 'https://i.pravatar.cc/120?img=47'}
          brands={brands}
          activeBrandId={activeBrandId}
          hasUnreadNotifications={unreadCount > 0}
          tier={tier}
          brandCap={tier ? brandLimits(tier).kits : undefined}
          favoritesCount={favoritesCount}
        />
      }
    />
  )
}
