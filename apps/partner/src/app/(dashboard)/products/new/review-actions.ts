'use server'

// Real, domain-aware Review summary for the New Product flow. Replaces the
// hardcoded placeholder cards on the Review & submit step with actual draft data:
// the formulation summary varies by product domain (Nutrition / Supplement Facts /
// INCI declaration / Guaranteed Analysis), plus real pricing tiers + packaging.
// Partner-gated to the owning service. Cast-guarded for formulationData.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export interface ReviewSummary {
  name: string
  domain: string // labelingType
  domainLabel: string // "Supplement"
  labelArtifact: string // "Supplement Facts" / "Nutrition Facts" / "INCI declaration" / …
  formulationTitle: string // "8 dietary ingredients · 1 blend"
  formulationStatus: 'done' | 'progress' | 'empty'
  statementOfIdentity: string | null
  /** FOOD only: Nutrition Facts audience label (21 CFR 101.9(j)(5)). null otherwise. */
  ageGroupLabel: string | null
  flavors: number
  pricingTiers: number
  lowestCents: number | null
  packagingName: string | null
  niches: number
  tags: number
}

type Result = { ok: true; data: ReviewSummary } | { ok: false; error: string }

const DOMAIN_LABEL: Record<string, { label: string; artifact: string }> = {
  FOOD: { label: 'Food / Beverage', artifact: 'Nutrition Facts' },
  DIETARY_SUPPLEMENT: { label: 'Supplement', artifact: 'Supplement Facts' },
  COSMETIC: { label: 'Cosmetic', artifact: 'INCI ingredient declaration' },
  PET_PRODUCT: { label: 'Pet', artifact: 'Guaranteed Analysis' },
  OTC: { label: 'OTC drug', artifact: 'Drug Facts' },
}

export async function getProductReviewSummary(draftId: string): Promise<Result> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  try {
    const tpl = await (prisma as unknown as {
      productTemplate: { findUnique: (a: unknown) => Promise<{
        name: string
        labelingType: string
        intendedAgeGroup: string | null
        statementOfIdentity: string | null
        manufacturerServiceId: string | null
        formulationData: Record<string, unknown> | null
        packingProfile: { name: string } | null
        pricingTiers: Array<{ minQty: number; perUnitCostCents: number }>
        _count: { ingredientSlots: number; flavorPresets: number; niches: number; lifestyleTags: number }
      } | null> }
    }).productTemplate.findUnique({
      where: { id: draftId },
      select: {
        name: true, labelingType: true, intendedAgeGroup: true, statementOfIdentity: true, manufacturerServiceId: true,
        formulationData: true,
        packingProfile: { select: { name: true } },
        pricingTiers: { select: { minQty: true, perUnitCostCents: true }, orderBy: { minQty: 'asc' } },
        _count: { select: { ingredientSlots: true, flavorPresets: true, niches: true, lifestyleTags: true } },
      },
    })
    if (!tpl) return { ok: false, error: 'Draft not found.' }

    // Ownership (best-effort; matches the other save actions).
    const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { services: { select: { id: true } } } })
    const ownIds = partner?.services.map((s) => s.id) ?? []
    if (tpl.manufacturerServiceId && !ownIds.includes(tpl.manufacturerServiceId)) return { ok: false, error: 'Not your product.' }

    const dom = tpl.labelingType
    const meta = DOMAIN_LABEL[dom] ?? DOMAIN_LABEL.FOOD!
    const fd = (tpl.formulationData ?? {}) as Record<string, unknown>

    let formulationTitle = 'Not started'
    let formulationStatus: ReviewSummary['formulationStatus'] = 'empty'
    if (dom === 'DIETARY_SUPPLEMENT') {
      const s = (fd.supplement ?? {}) as { dietaryIngredients?: unknown[]; blends?: unknown[]; dosageForm?: string }
      const di = s.dietaryIngredients?.length ?? 0
      const bl = s.blends?.length ?? 0
      if (di > 0) {
        formulationTitle = `${di} dietary ingredient${di === 1 ? '' : 's'}${bl ? ` · ${bl} blend${bl === 1 ? '' : 's'}` : ''}${s.dosageForm ? ` · ${s.dosageForm}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'COSMETIC') {
      const c = (fd.cosmetic ?? {}) as { ingredients?: unknown[]; netContentsQty?: number; netContentsUnit?: string }
      const n = c.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} INCI ingredient${n === 1 ? '' : 's'}${c.netContentsQty ? ` · ${c.netContentsQty} ${c.netContentsUnit ?? ''}` : ''}`
        formulationStatus = 'done'
      }
    } else if (dom === 'PET_PRODUCT') {
      const p = (fd.pet ?? {}) as { ingredients?: unknown[]; species?: string; method?: string }
      const n = p.ingredients?.length ?? 0
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${p.species ? ` · ${p.species}` : ''}${p.method === 'intermittent' ? ' · treat' : ''}`
        formulationStatus = 'done'
      }
    } else {
      // FOOD (and fallback)
      const n = tpl._count.ingredientSlots
      if (n > 0) {
        formulationTitle = `${n} ingredient${n === 1 ? '' : 's'}${tpl._count.flavorPresets ? ` · ${tpl._count.flavorPresets} flavor${tpl._count.flavorPresets === 1 ? '' : 's'}` : ''}`
        formulationStatus = 'done'
      }
    }

    const lowestCents = tpl.pricingTiers.length ? Math.min(...tpl.pricingTiers.map((t) => t.perUnitCostCents)) : null

    // FOOD only: surface the Nutrition Facts audience (21 CFR 101.9(j)(5)).
    const AGE_GROUP_LABEL: Record<string, string> = {
      GENERAL: 'General — adults & children 4+',
      CHILD_1_3: 'Children 1–3 years',
      INFANT_0_12: 'Infants 0–12 months',
    }
    const ageGroupLabel = dom === 'FOOD'
      ? (AGE_GROUP_LABEL[String(tpl.intendedAgeGroup ?? 'GENERAL')] ?? 'General — adults & children 4+')
      : null

    return {
      ok: true,
      data: {
        name: tpl.name,
        domain: dom,
        domainLabel: meta.label,
        labelArtifact: meta.artifact,
        formulationTitle,
        formulationStatus,
        statementOfIdentity: tpl.statementOfIdentity,
        ageGroupLabel,
        flavors: tpl._count.flavorPresets,
        pricingTiers: tpl.pricingTiers.length,
        lowestCents,
        packagingName: tpl.packingProfile?.name ?? null,
        niches: tpl._count.niches,
        tags: tpl._count.lifestyleTags,
      },
    }
  } catch (err) {
    return { ok: false, error: `Could not load review: ${(err as Error).message}` }
  }
}
