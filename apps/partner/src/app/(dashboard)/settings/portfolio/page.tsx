// Settings → Portfolio — the #p-portfolio panel of
// design/partner-profile-prototype-v2.html (Front Face slice 2).
// Tiles shown on the public profile's "Recent work" grid. Server shell reads
// the partner's items; the client grid handles add/publish/reorder/delete.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { PortfolioClient } from './PortfolioClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Portfolio — Settings' }

export default async function PortfolioSettingsPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      profilePublishedAt: true,
      portfolioItems: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, meta: true, imageUrl: true, published: true },
      },
    },
  })
  if (!partner) return null

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          {roleWord} · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Portfolio
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Showcase past runs on your public profile&rsquo;s &ldquo;Recent work&rdquo; grid.
          Published tiles appear to eligible creators{partner.profilePublishedAt ? '' : ' once you publish your profile (Settings → Company profile)'}.
        </p>
      </div>

      <PortfolioClient items={partner.portfolioItems} />
    </div>
  )
}
