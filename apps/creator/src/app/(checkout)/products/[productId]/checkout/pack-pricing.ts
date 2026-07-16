// The ONE derivation of a variety pack's priced subtotal.
//
// WHY THIS FILE EXISTS (2026-07-16). `readPackOrderInputs` + the pack-subtotal
// math lived inside cart-actions.ts, a 'use server' file, so the checkout ESTIMATE
// could not import them. It therefore priced every order on the COST_BUILDUP basis
// while the charge priced a pack order on PACK_PRICE, and the creator was quoted
// the catalog buildup and billed the manufacturer's pack price.
//
// That is the third time this exact shape has bitten:
//   - estimateProductionCost's decoration math was trapped in 'use server', so the
//     charge silently omitted decoration entirely (fixed: @ilaunchify/plans
//     priceComponents).
//   - creatorFeeCents was trapped beside a prisma-importing neighbour, so the
//     client configurator hand-rolled the fee and dropped the FeeRule bounds
//     (fixed: creator-fee-math.ts + the @ilaunchify/plans/math subpath).
//   - and this one.
//
// The cure is always the same: give the shared thing a file nothing has to be a
// server action to import. This module is deliberately NOT 'use server' (such a
// file may only export async functions, which is precisely what blocks reuse).
//
// It is prisma-backed, so it cannot live in @ilaunchify/plans (that package's pure
// half is what client components import). It lives here, next to its two callers.

import { prisma } from '@ilaunchify/db'
import {
  composePack,
  packPriceCents,
  orderTotalCents,
  type PricingBasis as PackPricingBasis,
} from '@ilaunchify/ui'

type PackFlavorFillRule = 'CREATOR_CHOOSES' | 'EVEN_AUTO' | 'MANUFACTURER_FIXED'

/** The creator's pack composition, as the draft state carries it. */
export interface PackSelectionInput {
  packVariantId: string | null
  packCount: number
  unitsPerPack: number
  slots: Array<{ flavorPresetId: string; units: number }>
}

export interface PackOrderInputs {
  unitsPerPack: number | null
  pricePerPackCents: number | null
  minFlavors: number | null
  fillRule: PackFlavorFillRule | null
  pricingBasis: PackPricingBasis | null
  pool: Array<{ flavorPresetId: string; unitPriceCents: number | null }>
}

/**
 * Read the chosen variant's pack columns + the template's flavor rules + the
 * per-flavor price pool. Mirrors readPackModel in marketing/pricing.ts.
 *
 * Cast-guarded: the generated client may not type these columns pre-migration.
 * Returns empty defaults on ANY failure, so the caller falls back to the client's
 * snapshot and a PER_FLAVOR default: the order still places.
 */
export async function readPackOrderInputs(
  templateId: string | null,
  variantId: string,
): Promise<PackOrderInputs> {
  const empty: PackOrderInputs = {
    unitsPerPack: null,
    pricePerPackCents: null,
    minFlavors: null,
    fillRule: null,
    pricingBasis: null,
    pool: [],
  }
  if (!templateId) return empty
  try {
    const t = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          minFlavorsPerPack: number | null
          flavorFillRule: PackFlavorFillRule | null
          pricingBasis: PackPricingBasis | null
          variants: Array<{ id: string; unitsPerPack: number | null; pricePerPackCents: number | null }>
          flavorPresets: Array<{ id: string; unitPriceCents: number | null }>
        } | null>
      }
    }).productTemplate.findUnique({
      where: { id: templateId },
      select: {
        minFlavorsPerPack: true,
        flavorFillRule: true,
        pricingBasis: true,
        variants: { select: { id: true, unitsPerPack: true, pricePerPackCents: true } },
        flavorPresets: { where: { status: 'ACTIVE' }, select: { id: true, unitPriceCents: true } },
      },
    })
    if (!t) return empty
    const v = (t.variants ?? []).find((x) => x.id === variantId)
    return {
      unitsPerPack: v?.unitsPerPack ?? null,
      pricePerPackCents: v?.pricePerPackCents ?? null,
      minFlavors: t.minFlavorsPerPack ?? null,
      fillRule: t.flavorFillRule ?? null,
      pricingBasis: t.pricingBasis ?? null,
      pool: (t.flavorPresets ?? []).map((f) => ({
        flavorPresetId: f.id,
        unitPriceCents: f.unitPriceCents ?? null,
      })),
    }
  } catch {
    return empty
  }
}

export type PackSubtotal =
  | { ok: true; isPack: false }
  | {
      ok: true
      isPack: true
      /** The creator-agreed pack price x packCount. THE goods basis for a pack order. */
      packPricedSubtotalCents: number
      pricePerPackCents: number
      unitsPerPack: number
      basis: PackPricingBasis
      slots: Array<{ flavorPresetId: string; units: number }>
      pool: PackOrderInputs['pool']
    }
  | { ok: false; error: string }

/**
 * Resolve a pack order's priced subtotal. THE single expression both the estimate
 * and the charge use, so the number the creator is quoted is the number they pay.
 *
 * Returns `{ isPack: false }` when there is no pack selection: the caller then
 * prices on the COST_BUILDUP basis, which is correct for a legacy non-pack order.
 */
export async function resolvePackSubtotal(input: {
  productTemplateId: string | null
  pack: PackSelectionInput | null | undefined
  maxFlavorsPerPack: number | null
  /** The estimate only reads a price; the charge also enforces composition. */
  validateComposition?: boolean
}): Promise<PackSubtotal> {
  const packSel = input.pack
  if (!packSel || !packSel.packVariantId || packSel.packCount <= 0) return { ok: true, isPack: false }

  const matrix = await readPackOrderInputs(input.productTemplateId, packSel.packVariantId)
  const unitsPerPack = matrix.unitsPerPack ?? packSel.unitsPerPack
  const choices = packSel.slots.map((s) => ({ flavorPresetId: s.flavorPresetId, units: s.units }))
  const composed = composePack({ unitsPerPack }, choices, {
    minFlavorsPerPack: matrix.minFlavors ?? 1,
    maxFlavorsPerPack: input.maxFlavorsPerPack,
    fillRule: (matrix.fillRule ?? 'CREATOR_CHOOSES') as PackFlavorFillRule,
  })
  if (!composed.ok && input.validateComposition !== false) {
    return {
      ok: false,
      error: composed.errors[0]?.message ?? 'Adjust your variety pack in step 2 before paying.',
    }
  }

  const basis: PackPricingBasis = (matrix.pricingBasis ?? 'PER_FLAVOR') as PackPricingBasis
  const pricePerPack = packPriceCents(
    basis,
    { pricePerPackCents: matrix.pricePerPackCents ?? null },
    composed.slots,
    matrix.pool,
  )
  return {
    ok: true,
    isPack: true,
    packPricedSubtotalCents: orderTotalCents(pricePerPack, packSel.packCount),
    pricePerPackCents: pricePerPack,
    unitsPerPack,
    basis,
    slots: composed.slots,
    pool: matrix.pool,
  }
}
