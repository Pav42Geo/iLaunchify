// Per-partner access context reader — the raw facts + overrides the Partner
// Access console needs to resolve each lever. docs/PARTNER_ACCESS_ADMIN_CONTROLS.
//
// Prisma-only (no @ilaunchify/auth dependency — the resolver lives there and is
// composed in the admin layer). Overrides are cast-guarded + fail-soft so this
// works before PartnerAccessOverride lands on the generated client.

import { prisma } from './index'

export interface PartnerAccessOverrideRow {
  lever: string
  state: string // 'INHERIT' | 'ALLOW' | 'DENY'
  value: string | null
  reason: string | null
  expiresAt: Date | null
}

export interface PartnerAccessContext {
  partnerId: string
  companyName: string
  tier: string
  status: string
  participationMode: string // 'PUBLIC' | 'INVITED_ONLY'
  serviceTypes: string[]
  profilePublished: boolean
  hasFullDisclosureNameable: boolean
  isPurePrinter: boolean
  onboardingComplete: boolean
  overrides: PartnerAccessOverrideRow[]
}

export async function getPartnerAccessContext(
  partnerId: string,
): Promise<PartnerAccessContext | null> {
  return loadPartnerAccessContext({ id: partnerId })
}

/** Same context, keyed by the public slug (used by the marketing profile route). */
export async function getPartnerAccessContextBySlug(
  slug: string,
): Promise<PartnerAccessContext | null> {
  return loadPartnerAccessContext({ slug })
}

async function loadPartnerAccessContext(
  where: { id: string } | { slug: string },
): Promise<PartnerAccessContext | null> {
  const partner = await prisma.partner.findUnique({
    where,
    select: {
      id: true,
      companyName: true,
      tier: true,
      status: true,
      participationMode: true,
      profilePublishedAt: true,
      activatedAt: true,
      services: { select: { type: true, status: true, disclosureLevel: true } },
    },
  })
  if (!partner) return null

  const active = partner.services.filter((s) => s.status === 'ACTIVE')
  const hasMfrCopack = active.some((s) => s.type === 'MANUFACTURING' || s.type === 'COPACKING')
  const hasPrint = active.some((s) => s.type === 'LABEL_PRINTING')
  const hasFullDisclosureNameable = active.some(
    (s) => (s.type === 'MANUFACTURING' || s.type === 'COPACKING') && s.disclosureLevel === 'FULL',
  )

  // Overrides — cast-guarded, fail-soft to [].
  const overrides = await (
    prisma as unknown as {
      partnerAccessOverride: {
        findMany: (a: unknown) => Promise<PartnerAccessOverrideRow[]>
      }
    }
  ).partnerAccessOverride
    .findMany({
      where: { partnerId: partner.id },
      select: { lever: true, state: true, value: true, reason: true, expiresAt: true },
    })
    .catch(() => [] as PartnerAccessOverrideRow[])

  return {
    partnerId: partner.id,
    companyName: partner.companyName,
    tier: partner.tier as string,
    status: partner.status as string,
    participationMode: partner.participationMode as string,
    serviceTypes: [...new Set(active.map((s) => s.type as string))],
    profilePublished: partner.profilePublishedAt != null,
    hasFullDisclosureNameable,
    isPurePrinter: hasPrint && !hasMfrCopack,
    onboardingComplete: partner.activatedAt != null,
    overrides,
  }
}
