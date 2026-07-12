// Settings hub layout — Front Face slice 3.
// design/partner-profile-prototype-v2.html SCREEN: SETTINGS: the st-topband
// (identity + tier badge + status sub-line + profile-completeness ring + View
// public profile) and the grouped st-rail wrap every /settings/* page. The
// existing sub-pages render unchanged inside — 15 scattered destinations, now
// grouped (Public profile / Standing / Operations / Account), nothing dropped.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { Eye, Star } from 'lucide-react'
import { marketingUrl } from '@/lib/marketing-url'
import { computeProfileCompleteness } from '@/lib/profile-completeness'
import { SettingsRail } from './SettingsRail'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      legalName: true,
      tier: true,
      participationMode: true,
      logoUrl: true,
      coverImageUrl: true,
      tagline: true,
      about: true,
      bestForTags: true,
      slug: true,
      profilePublishedAt: true,
      services: {
        where: { type: { in: ['MANUFACTURING', 'COPACKING'] } },
        select: { disclosureLevel: true },
      },
    },
  })
  if (!partner) return <>{children}</>

  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const [dbUser, portfolioPublished, verifiedCerts, expiringCerts, teamCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { stripeAccountStatus: true } }),
    prisma.partnerPortfolioItem.count({ where: { partnerId: partner.id, published: true } }),
    prisma.partnerCertificateInstance.count({
      where: { partnerId: partner.id, status: 'VERIFIED' },
    }),
    prisma.partnerCertificateInstance.count({
      where: { partnerId: partner.id, status: 'VERIFIED', expiryDate: { lte: soon } },
    }),
    prisma.partnerMembership.count({ where: { partnerId: partner.id, removedAt: null } }),
  ])

  const { pct, nextHint } = computeProfileCompleteness({
    hasLogo: Boolean(partner.logoUrl),
    hasCover: Boolean(partner.coverImageUrl),
    taglineLength: partner.tagline?.length ?? 0,
    aboutLength: partner.about?.length ?? 0,
    bestForCount: partner.bestForTags?.length ?? 0,
    disclosureFull: partner.services.some((s) => s.disclosureLevel === 'FULL'),
    published: Boolean(partner.profilePublishedAt),
    publishedPortfolioCount: portfolioPublished,
    verifiedCertCount: verifiedCerts,
  })

  const tierLabel =
    partner.tier === 'PREMIER' ? 'Premier' : partner.tier === 'TRUSTED' ? 'Trusted' : 'Verified'
  const subBits = [
    partner.legalName,
    dbUser?.stripeAccountStatus === 'ACTIVE' ? 'Payouts active' : 'Payouts pending',
    partner.participationMode === 'PUBLIC' ? 'Open market' : 'Invited-only',
  ].filter(Boolean)
  const profileLive = Boolean(partner.slug && partner.profilePublishedAt)
  const initial = partner.companyName.charAt(0).toUpperCase() || 'P'

  return (
    <div className="space-y-4">
      {/* ===== st-topband ===== */}
      <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-5">
        <div
          className="grid h-[52px] w-[52px] flex-none place-items-center overflow-hidden rounded-[14px] font-display text-[20px] font-extrabold text-white"
          style={
            partner.logoUrl
              ? { background: `center / cover url(${partner.logoUrl})` }
              : { background: 'linear-gradient(135deg, var(--pink-500), var(--pink-700))' }
          }
        >
          {!partner.logoUrl && initial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-display text-[18px] font-bold text-ink-900">
            <span className="truncate">{partner.companyName}</span>
            <span
              className={
                'inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] ' +
                (partner.tier === 'VERIFIED'
                  ? 'border border-ink-200 bg-ink-100 text-ink-600'
                  : 'bg-neon-500 text-ink-900')
              }
            >
              <Star className="h-[11px] w-[11px]" />
              {tierLabel}
            </span>
          </div>
          <div className="truncate text-[12.5px] text-ink-500">{subBits.join(' · ')}</div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3.5">
          {/* completeness ring */}
          <div className="flex items-center gap-3">
            <div
              className="relative grid h-11 w-11 flex-none place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--pink-500) ${pct}%, var(--ink-100) 0)`,
              }}
            >
              <div className="absolute h-8 w-8 rounded-full bg-[var(--bg-hero)]" />
              <b className="relative text-[12px] font-bold text-ink-900">{pct}%</b>
            </div>
            <div className="text-[12px] leading-tight">
              <b className="text-[13px] text-ink-900">Profile {pct}% complete</b>
              <br />
              <span className="text-ink-500">{nextHint ?? 'Fully complete — nice.'}</span>
            </div>
          </div>
          {profileLive ? (
            <a
              href={marketingUrl(`/partners/${partner.slug}`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-ink-50"
            >
              <Eye className="h-3.5 w-3.5" />
              View public profile
            </a>
          ) : (
            <a
              href="/settings/company"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black"
            >
              Publish your profile →
            </a>
          )}
        </div>
      </div>

      {/* ===== rail + content ===== */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <SettingsRail badges={{ certsNeedAttention: expiringCerts, teamCount }} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
