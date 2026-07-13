// Settings → Company profile — the #p-company panel of
// design/partner-profile-prototype-v2.html (Pavel 2026-07-12).
//
// The partner's official identity: it powers the public Front Face
// (marketing /partners/[slug]) and marketplace discovery. Server side reads
// the Partner row + nameable services' disclosure level + verification-doc
// status; the client card handles autosave editing, disclosure, logo/cover
// image upload (media-actions.ts → R2 public rail), and publish/preview.

import { prisma, getActiveMarketCountries } from '@ilaunchify/db'
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
      status: true,
      companyName: true,
      legalName: true,
      websiteUrl: true,
      contactPhone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
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
      facilities: {
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          isDefault: true,
        },
      },
      verificationSections: {
        where: { type: { in: ['BUSINESS', 'DOCUMENTS'] } },
        select: { type: true, status: true, verifiedAt: true },
      },
      files: {
        where: { sectionType: 'DOCUMENTS' },
        orderBy: { uploadedAt: 'desc' },
        select: {
          kind: true,
          originalFilename: true,
          uploadedAt: true,
          expiresAt: true,
        },
      },
    },
  })
  if (!partner) return null

  // Country options come from PLATFORM MARKETS (admin-managed): only ACTIVE
  // markets are offered — V1 is US-only, so the field renders fixed exactly
  // like the onboarding form; activating CA in admin adds Canada here.
  const countries = await getActiveMarketCountries()

  // Facilities are the SINGLE address source (Pavel 2026-07-12). Legacy
  // partners whose address lives only on the Partner row (captured in
  // onboarding, pre-facilities) get their primary facility backfilled from it
  // — best-effort, mirrors the layout's membership backfill pattern.
  if (partner.facilities.length === 0 && partner.addressLine1 && partner.city) {
    try {
      const created = await prisma.partnerFacility.create({
        data: {
          partnerId: partner.id,
          name: `${partner.companyName} — ${partner.city}`,
          addressLine1: partner.addressLine1,
          addressLine2: partner.addressLine2,
          city: partner.city,
          region: partner.state ?? '',
          postalCode: partner.postalCode ?? '',
          country: partner.country || 'US',
          isDefault: true,
        },
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          isDefault: true,
        },
      })
      partner.facilities.push(created)
    } catch {
      // Non-fatal — the manager just starts empty.
    }
  }

  // Verification-document slots (prototype docslots) — latest file per
  // canonical kind + the DOCUMENTS section's review status. Real data only.
  const docsSection = partner.verificationSections.find((s) => s.type === 'DOCUMENTS')
  const DOC_KINDS = ['CERT_OF_INCORPORATION', 'BUSINESS_LICENSE', 'INSURANCE'] as const
  const DOC_LABEL: Record<(typeof DOC_KINDS)[number], string> = {
    CERT_OF_INCORPORATION: 'Certificate of incorporation',
    BUSINESS_LICENSE: 'Business license',
    INSURANCE: 'General liability insurance',
  }
  const docSlots = DOC_KINDS.map((kind) => {
    const f = partner.files.find((x) => x.kind === kind) ?? null
    return {
      kind,
      label: DOC_LABEL[kind],
      filename: f?.originalFilename ?? null,
      uploadedAt: f?.uploadedAt?.toISOString() ?? null,
      expiresAt: f?.expiresAt?.toISOString() ?? null,
      sectionStatus: (docsSection?.status ?? 'PENDING') as string,
      sectionVerifiedAt: docsSection?.verifiedAt?.toISOString() ?? null,
    }
  })

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
          city: partner.city ?? '',
          state: partner.state ?? '',
          countries,
          docSlots,
          hasNameableService: partner.services.length > 0,
          disclosure,
          published: Boolean(partner.profilePublishedAt),
          previewHref,
          facilities: partner.facilities,
        }}
      />
    </div>
  )
}
