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
import { prisma } from '@ilaunchify/db'
import type { User } from '@ilaunchify/auth'
import { AppHeader } from '@ilaunchify/ui'
import { TopbarRight } from './TopbarRight'

const COOKIE_NAME = 'active_brand_id'

export async function DashboardTopbar({ user }: { user: User }) {
  // Load brands for the switcher. Admin users impersonating /creator
  // won't have a CreatorProfile — gracefully render the bare topbar.
  let brands: { id: string; name: string; handle: string }[] = []
  if (user.role === 'CREATOR') {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: {
        brands: {
          select: { id: true, name: true, handle: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    brands = profile?.brands ?? []
  }

  // Notification dot — check for any unread bell-channel notification.
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, channel: 'IN_APP', readAt: null },
  })

  const cookieStore = await cookies()
  const activeBrandIdCookie = cookieStore.get(COOKIE_NAME)?.value ?? ''
  const activeBrandId =
    brands.find((b) => b.id === activeBrandIdCookie)?.id ?? brands[0]?.id ?? ''

  return (
    <AppHeader
      brandHref="/dashboard"
      flushLeft
      right={
        <TopbarRight
          email={user.email}
          name={user.name ?? null}
          brands={brands}
          activeBrandId={activeBrandId}
          hasUnreadNotifications={unreadCount > 0}
        />
      }
    />
  )
}
