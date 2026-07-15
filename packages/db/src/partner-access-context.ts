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

const PARTNER_ACCESS_SELECT = {
  id: true,
  companyName: true,
  tier: true,
  status: true,
  participationMode: true,
  profilePublishedAt: true,
  activatedAt: true,
  services: { select: { type: true, status: true, disclosureLevel: true } },
} as const

type PartnerAccessRow = {
  id: string
  companyName: string
  tier: string
  status: string
  participationMode: string
  profilePublishedAt: Date | null
  activatedAt: Date | null
  services: { type: string; status: string; disclosureLevel: string }[]
}

function assemblePartnerAccessContext(
  partner: PartnerAccessRow,
  overrides: PartnerAccessOverrideRow[],
): PartnerAccessContext {
  const active = partner.services.filter((s) => s.status === 'ACTIVE')
  const hasMfrCopack = active.some((s) => s.type === 'MANUFACTURING' || s.type === 'COPACKING')
  const hasPrint = active.some((s) => s.type === 'LABEL_PRINTING')
  const hasFullDisclosureNameable = active.some(
    (s) => (s.type === 'MANUFACTURING' || s.type === 'COPACKING') && s.disclosureLevel === 'FULL',
  )
  return {
    partnerId: partner.id,
    companyName: partner.companyName,
    tier: partner.tier,
    status: partner.status,
    participationMode: partner.participationMode,
    serviceTypes: [...new Set(active.map((s) => s.type))],
    profilePublished: partner.profilePublishedAt != null,
    hasFullDisclosureNameable,
    isPurePrinter: hasPrint && !hasMfrCopack,
    onboardingComplete: partner.activatedAt != null,
    overrides,
  }
}

/**
 * Batched list for the admin bulk Access table — one partner query + one overrides
 * query, assembled per partner. The caller resolves the levers.
 */
export async function listPartnerAccessContexts(opts: {
  take: number
  skip: number
}): Promise<PartnerAccessContext[]> {
  const partners = (await prisma.partner.findMany({
    orderBy: { companyName: 'asc' },
    take: opts.take,
    skip: opts.skip,
    select: PARTNER_ACCESS_SELECT,
  })) as unknown as PartnerAccessRow[]
  if (!partners.length) return []

  const ids = partners.map((p) => p.id)
  const overrides = await (
    prisma as unknown as {
      partnerAccessOverride: {
        findMany: (a: unknown) => Promise<(PartnerAccessOverrideRow & { partnerId: string })[]>
      }
    }
  ).partnerAccessOverride
    .findMany({
      where: { partnerId: { in: ids } },
      select: {
        partnerId: true,
        lever: true,
        state: true,
        value: true,
        reason: true,
        expiresAt: true,
      },
    })
    .catch(() => [] as (PartnerAccessOverrideRow & { partnerId: string })[])

  const byPartner = new Map<string, PartnerAccessOverrideRow[]>()
  for (const o of overrides) {
    const arr = byPartner.get(o.partnerId) ?? []
    arr.push({ lever: o.lever, state: o.state, value: o.value, reason: o.reason, expiresAt: o.expiresAt })
    byPartner.set(o.partnerId, arr)
  }
  return partners.map((p) => assemblePartnerAccessContext(p, byPartner.get(p.id) ?? []))
}

/** Cheap header KPIs for the bulk Access table. All fail-soft. */
export async function getPartnerAccessCounts(): Promise<{
  total: number
  publicProfiles: number
  withOverrides: number
  restricted: number
  pendingRequests: number
}> {
  const [total, publicProfiles] = await Promise.all([
    prisma.partner.count().catch(() => 0),
    prisma.partner
      .count({ where: { participationMode: 'PUBLIC', profilePublishedAt: { not: null } } })
      .catch(() => 0),
  ])
  const overrideRows = await (
    prisma as unknown as {
      partnerAccessOverride: {
        findMany: (a: unknown) => Promise<{ partnerId: string; state: string }[]>
      }
    }
  ).partnerAccessOverride
    .findMany({ select: { partnerId: true, state: true } })
    .catch(() => [] as { partnerId: string; state: string }[])
  const withOverrides = new Set(overrideRows.map((r) => r.partnerId)).size
  const restricted = new Set(
    overrideRows.filter((r) => r.state === 'DENY').map((r) => r.partnerId),
  ).size
  const pendingRequests = await (
    prisma as unknown as {
      partnerAccessRequest: { count: (a: unknown) => Promise<number> }
    }
  ).partnerAccessRequest
    .count({ where: { status: 'PENDING' } })
    .catch(() => 0)
  return { total, publicProfiles, withOverrides, restricted, pendingRequests }
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
