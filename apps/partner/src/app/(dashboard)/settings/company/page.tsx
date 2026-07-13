// Settings → Company profile — the #p-company panel of
// design/partner-profile-prototype-v2.html (Pavel 2026-07-12).
//
// The partner's official identity: it powers the public Front Face
// (marketing /partners/[slug]) and marketplace discovery. Server side reads
// the Partner row + nameable services' disclosure level + verification-doc
// status; the client card handles autosave editing, disclosure, logo/cover
// image upload (media-actions.ts → R2 public rail), and publish/preview.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getPartnerRoleWord } from '@/lib/partner-role'
import { CompanyProfileClient } from './CompanyProfileClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Company profile — Settings' }

export default async function CompanyProfileSettingsPage() {
  const roleWord = await getPartnerRoleWord()
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      legalName: true,
      websiteUrl: true,
      contactPhone: true,
      addressLine1: true,
      city: true,
      state: true,
      slug: true,
      logoUrl: true,
      coverImageUrl: true,
      tagline: true,
      about: true,
      bestForTags: true,
      profilePublishedAt: true,
      tier: true,
      services: {
        where: { type: { in: ['MANUFACTURING', 'COPACKING'] } },
        select: { disclosureLevel: true },
      },
      facilities: { select: { name: true, city: true, region: true, isDefault: true } },
    },
  })
  if (!partner) return null

  // One disclosure control for all nameable services — most restrictive wins
  // for display when they diverge.
  const levels = partner.services.map((s) => s.disclosureLevel as string)
  const disclosure = levels.includes('ANONYMOUS')
    ? 'ANONYMOUS'
    : levels.includes('CITY_STATE')
      ? 'CITY_STATE'
      : levels.length
        ? 'FULL'
        : 'ANONYMOUS'

  // In-app preview (the marketing route is creator-tier-gated, so the partner
  // themselves can only see the Front Face via /profile).
  const previewHref = partner.slug && partner.profilePublishedAt ? '/profile' : null

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          {roleWord} · Settings
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Company profile
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Your official identity — powers your public front face and marketplace discovery. Profiles
          are shown only to eligible creators, and only when your disclosure level allows it.
        </p>
      </div>

      <CompanyProfileClient
        initial={{
          companyName: partner.companyName,
          legalName: partner.legalName,
          websiteUrl: partner.websiteUrl ?? '',
          contactPhone: partner.contactPhone ?? '',
          tagline: partner.tagline ?? '',
          about: partner.about ?? '',
          bestForTags: partner.bestForTags ?? [],
          logoUrl: partner.logoUrl,
          coverImageUrl: partner.coverImageUrl,
          addressLine1: partner.addressLine1 ?? '',
          city: partner.city ?? '',
          state: partner.state ?? '',
          hasNameableService: partner.services.length > 0,
          disclosure,
          published: Boolean(partner.profilePublishedAt),
          previewHref,
          facilities: partner.facilities.map((f) => ({
            name: f.name,
            city: f.city,
            region: f.region,
            isDefault: f.isDefault,
          })),
        }}
      />
    </div>
  )
}
