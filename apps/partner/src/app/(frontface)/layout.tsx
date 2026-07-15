// Header-only shell (partner topbar, NO sidebar) for full-page previews like the
// public Front Face (Pavel 2026-07-15). The dashboard chrome (sidebar + tab
// rows) would frame the profile as "an app screen"; here it stands alone as the
// clean public page a creator would see, reachable from the header nav.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { PartnerTopbar } from '@/components/nav/PartnerTopbar'

export default async function FrontFaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { companyName: true, tier: true },
  })

  return (
    <div className="flex h-screen flex-col">
      <PartnerTopbar user={user} companyName={partner?.companyName ?? ''} tier={partner?.tier ?? null} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50">
        <div className="mx-auto w-full max-w-[72rem] px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
