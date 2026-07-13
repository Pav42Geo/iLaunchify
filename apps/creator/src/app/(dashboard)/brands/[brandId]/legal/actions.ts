'use server'

// Brand legal identity — the responsible-party firm + PLACE OF BUSINESS that
// composes the label's 21 CFR 101.5 line ("Manufactured for / Distributed by
// [Brand], City, ST ZIP"). Pavel 2026-07-12.
//
// Ownership via creatorProfile.userId (same fence as the brand-kit actions);
// country restricted to ACTIVE platform markets (server-side mirror of the
// market-driven select); audited.

import { prisma, getActiveMarketCountries } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export interface BrandLegalIdentityInput {
  brandId: string
  legalName?: string
  legalAddressLine1?: string
  legalAddressLine2?: string
  legalCity?: string
  legalState?: string
  legalPostalCode?: string
  legalCountry?: string
}

export type BrandLegalResult = { ok: true } | { ok: false; error: string }

export async function saveBrandLegalIdentity(
  input: BrandLegalIdentityInput,
): Promise<BrandLegalResult> {
  const user = await requireUser()
  const brand = await prisma.brand.findFirst({
    where: { id: input.brandId, creatorProfile: { userId: user.id } },
    select: { id: true },
  })
  if (!brand) return { ok: false, error: 'Brand not found.' }

  const clean = (v: string | undefined, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) || null : undefined

  const data: Record<string, string | null> = {}
  const assign = (k: keyof BrandLegalIdentityInput, max: number) => {
    const v = clean(input[k] as string | undefined, max)
    if (v !== undefined) data[k] = v
  }
  assign('legalName', 160)
  assign('legalAddressLine1', 160)
  assign('legalAddressLine2', 160)
  assign('legalCity', 80)
  assign('legalState', 40)
  assign('legalPostalCode', 20)

  if (typeof input.legalCountry === 'string' && input.legalCountry.trim()) {
    const code = input.legalCountry.trim().slice(0, 2).toUpperCase()
    const offered = await getActiveMarketCountries()
    if (offered.some((c) => c.code === code)) data.legalCountry = code
  }
  if (Object.keys(data).length === 0) return { ok: true }

  await prisma.brand.update({ where: { id: brand.id }, data: data as never })
  await logAuditAs(user, {
    entityType: 'Brand',
    entityId: brand.id,
    action: 'BRAND_LEGAL_IDENTITY_UPDATED',
    payload: { fields: Object.keys(data) },
  })
  revalidatePath(`/brands/${brand.id}/legal`)
  revalidatePath(`/brands/${brand.id}`)
  return { ok: true }
}
