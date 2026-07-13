'use server'

// Company profile (Front Face) editor actions — design/partner-profile-prototype-v2.html
// #p-company (Pavel 2026-07-12). Three audited writes:
//   saveCompanyProfile   — identity + public bio fields (autosave target)
//   setDisclosureLevel   — the partner's label/name-reveal opt-in, applied to
//                          every MANUFACTURING/COPACKING service
//   setProfilePublished  — publish/unpublish the public profile (generates the
//                          unique slug on first publish)
//
// Every write goes through the acting partner's own row (ownership guard) and
// writes an AuditLog row (SECURITY_ARCHITECTURE.md / CLAUDE.md conventions).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

const NAMEABLE_TYPES = ['MANUFACTURING', 'COPACKING'] as const
const DISCLOSURE_LEVELS = ['ANONYMOUS', 'CITY_STATE', 'FULL'] as const
export type DisclosureLevelKey = (typeof DISCLOSURE_LEVELS)[number]

async function requirePartner() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, companyName: true, slug: true, profilePublishedAt: true },
  })
  return { user, partner }
}

export interface CompanyProfileInput {
  companyName?: string
  legalName?: string
  websiteUrl?: string
  contactPhone?: string
  tagline?: string
  about?: string
  bestForTags?: string[]
}

export async function saveCompanyProfile(input: CompanyProfileInput): Promise<void> {
  const { user, partner } = await requirePartner()
  if (!partner) return

  const data: Record<string, unknown> = {}
  if (typeof input.companyName === 'string' && input.companyName.trim())
    data.companyName = input.companyName.trim().slice(0, 120)
  if (typeof input.legalName === 'string' && input.legalName.trim())
    data.legalName = input.legalName.trim().slice(0, 160)
  if (typeof input.websiteUrl === 'string') data.websiteUrl = input.websiteUrl.trim().slice(0, 200) || null
  if (typeof input.contactPhone === 'string') data.contactPhone = input.contactPhone.trim().slice(0, 40) || null
  if (typeof input.tagline === 'string') data.tagline = input.tagline.trim().slice(0, 90) || null
  if (typeof input.about === 'string') data.about = input.about.trim().slice(0, 600) || null
  if (Array.isArray(input.bestForTags))
    data.bestForTags = [...new Set(input.bestForTags.map((t) => t.trim()).filter(Boolean))].slice(0, 5)
  if (Object.keys(data).length === 0) return

  await prisma.partner.update({ where: { id: partner.id }, data: data as never })
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'COMPANY_PROFILE_UPDATED',
    payload: { fields: Object.keys(data) },
  })
  revalidatePath('/settings/company')
}

/** Apply the label/name-reveal disclosure level to every mfr/co-pack service. */
export async function setDisclosureLevel(level: DisclosureLevelKey): Promise<void> {
  if (!DISCLOSURE_LEVELS.includes(level)) return
  const { user, partner } = await requirePartner()
  if (!partner) return

  const { count } = await prisma.partnerService.updateMany({
    where: { partnerId: partner.id, type: { in: [...NAMEABLE_TYPES] } },
    data: { disclosureLevel: level },
  })
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: 'DISCLOSURE_LEVEL_CHANGED',
    toValue: level,
    payload: { level, servicesUpdated: count },
  })
  revalidatePath('/settings/company')
}

// (The old standalone saveFacilityAddress was retired 2026-07-12 — the PRIMARY
// FACILITY is now the single address of record; facilities-actions.ts syncs it
// onto the legacy Partner address columns.)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Publish (or unpublish) the public Front Face. Generates the slug once. */
export async function setProfilePublished(publish: boolean): Promise<void> {
  const { user, partner } = await requirePartner()
  if (!partner) return

  let slug = partner.slug
  if (publish && !slug) {
    const base = slugify(partner.companyName) || 'partner'
    slug = base
    for (let i = 2; i < 50; i++) {
      const clash = await prisma.partner.findUnique({ where: { slug }, select: { id: true } })
      if (!clash) break
      slug = `${base}-${i}`
    }
  }

  await prisma.partner.update({
    where: { id: partner.id },
    data: {
      profilePublishedAt: publish ? (partner.profilePublishedAt ?? new Date()) : null,
      ...(publish && slug ? { slug } : {}),
    } as never,
  })
  await logAuditAs(user, {
    entityType: 'Partner',
    entityId: partner.id,
    action: publish ? 'PROFILE_PUBLISHED' : 'PROFILE_UNPUBLISHED',
    payload: { slug },
  })
  revalidatePath('/settings/company')
}
