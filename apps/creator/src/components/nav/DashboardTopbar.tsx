// Server-side topbar wrapper. Loads the brand list + active-brand cookie
// once per request so the client-side BrandSwitcher has everything it needs.
// Falls back to a thin email-only topbar if the user isn't a creator (admin
// or unauthenticated middleware misroute).

import { cookies } from 'next/headers'
import { prisma } from '@ilaunchify/db'
import type { User } from '@ilaunchify/auth'
import { BrandSwitcher } from './BrandSwitcher'
import { TopbarUserMenu } from './TopbarUserMenu'

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

  const cookieStore = await cookies()
  const activeBrandIdCookie = cookieStore.get(COOKIE_NAME)?.value ?? ''
  const activeBrandId =
    brands.find((b) => b.id === activeBrandIdCookie)?.id ?? brands[0]?.id ?? ''

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      </div>
      <TopbarUserMenu email={user.email} />
    </header>
  )
}
