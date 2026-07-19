// THE PRICE GATE: nothing reaches PUBLISHED without a partner-authored price.
//
// WHY (task #16, 2026-07-16). A ProductTemplate with zero ProductTemplatePricingTier
// rows has no price anyone authored. The marketplace used to paper over that by
// INVENTING a band curve (buildSamplePricingRows: base x 2.5/1.85/1.65/1.5/1.35/
// 1.2/1.05) while the till billed a ~54c/unit catalog buildup. Both are deleted
// under the LOCKED rule (Pavel): "kill hardcoded prices because this is something
// that we cannot decide as an operator/admin, that price should be added by any of
// the co-packers/manufacturers through the platform when they formulate their
// price."
//
// With the inventions gone, an unpriced template is browsable-but-unbuyable: the
// PDP renders "Pricing not published yet" and checkout refuses (@ilaunchify/plans
// resolveGoods -> null). This gate stops it reaching the marketplace at all.
//
// WHY THIS FILE EXISTS RATHER THAN AN `if` IN THE ADMIN ACTION: there are FOUR
// doors into PUBLISHED, across three packages, and gating one is theatre.
//   1. apps/admin   approveProductTemplate      (review -> PUBLISHED)
//   2. apps/admin   setProductPaused(PUBLISHED) (admin resume)
//   3. apps/partner resumeProduct               (partner resume, the likeliest one)
//   4. packages/orders capability-rfq           (auto-unpark on coverage restored)
// Tiers can be deleted while a template sits PAUSED, so every resume path is a
// publish. (apps/admin print-coverage-worker only PAUSES, which is always allowed:
// taking an unpriced listing DOWN needs no gate.)
//
// NOT in product-template-fsm.ts on purpose: that file is a PURE transition table
// and stays that way. This is a DATA precondition and needs I/O. Mixing the two is
// the exact disease that cost us today (pure math trapped beside impure code, so
// the next caller reimplements or omits it).

import { prisma } from '@ilaunchify/db'

/**
 * Has a manufacturer authored a real price for this template?
 *
 * TWO conditions, both partner-authored, or it bills a price nobody agreed to:
 *   1. Volume bands (ProductTemplatePricingTier) — the base per-unit price (#16/#18).
 *   2. #37 (2026-07-19): a MULTI-FLAVOR pack template ALSO needs its pack-basis price,
 *      because a pack order prices on its BASIS, never the band (see @ilaunchify plans
 *      resolvePackSubtotal). PER_FLAVOR sums the flavors' unitPriceCents; PER_PACK uses
 *      the pack-size pricePerPackCents. Without them a pack order billed $0 for goods
 *      (a live variety-pack charge did exactly this), yet passed the bands-only gate.
 *      An UNPRICED flavor / pack size fails: the creator could pick it and pay nothing
 *      for that portion.
 *
 * Fails CLOSED. A DB hiccup returns false, which blocks a publish rather than
 * letting an unpriced template through. Publishing is never urgent; billing a
 * price nobody agreed to is unrecoverable (we would have to refund and explain).
 */
export async function templateIsPriced(productTemplateId: string): Promise<boolean> {
  try {
    // 1. Volume bands — the base price.
    const bandCount = await prisma.productTemplatePricingTier.count({
      where: { productTemplateId },
    })
    if (bandCount === 0) return false

    // 2. Pack-basis price for a multi-flavor template. The pack columns are additive
    //    (cast-guarded, like readPackModel), so read them through a cast.
    const t = await (
      prisma as unknown as {
        productTemplate: {
          findUnique: (a: unknown) => Promise<{
            maxFlavorsPerPack: number | null
            pricingBasis: 'PER_FLAVOR' | 'PER_PACK' | null
            flavorPresets: Array<{ unitPriceCents: number | null }>
            variants: Array<{ unitsPerPack: number | null; pricePerPackCents: number | null }>
          } | null>
        }
      }
    ).productTemplate.findUnique({
      where: { id: productTemplateId },
      select: {
        maxFlavorsPerPack: true,
        pricingBasis: true,
        flavorPresets: { where: { status: 'ACTIVE' }, select: { unitPriceCents: true } },
        variants: { where: { isActive: true }, select: { unitsPerPack: true, pricePerPackCents: true } },
      },
    })
    if (!t) return false

    if (t.maxFlavorsPerPack != null) {
      const basis = t.pricingBasis ?? 'PER_FLAVOR'
      if (basis === 'PER_FLAVOR') {
        // Every offered flavor must be priced (an unpriced one adds $0 to the pack).
        const flavors = t.flavorPresets ?? []
        if (flavors.length === 0 || flavors.some((f) => (f.unitPriceCents ?? 0) <= 0)) return false
      } else {
        // PER_PACK: every offered pack SIZE (unitsPerPack set) must carry a pack price.
        const sizes = (t.variants ?? []).filter((v) => (v.unitsPerPack ?? 0) > 0)
        if (sizes.length === 0 || sizes.some((v) => (v.pricePerPackCents ?? 0) <= 0)) return false
      }
    }

    return true
  } catch {
    return false
  }
}

/** The one message every door shows, so the fix is unambiguous to whoever reads it. */
export const NO_PRICE_PUBLISH_ERROR =
  'No pricing published: the manufacturer must author a price before this can go live. That means volume bands, and for a variety pack the per-flavor prices (PER_FLAVOR basis) or per-pack prices (PER_PACK basis) as well.'
