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
 * Has a manufacturer authored any volume band for this template?
 *
 * Fails CLOSED. A DB hiccup returns false, which blocks a publish rather than
 * letting an unpriced template through. Publishing is never urgent; billing a
 * price nobody agreed to is unrecoverable (we would have to refund and explain).
 */
export async function templateIsPriced(productTemplateId: string): Promise<boolean> {
  try {
    const count = await prisma.productTemplatePricingTier.count({
      where: { productTemplateId },
    })
    return count > 0
  } catch {
    return false
  }
}

/** The one message every door shows, so the fix is unambiguous to whoever reads it. */
export const NO_PRICE_PUBLISH_ERROR =
  'No pricing published: this template has no volume bands, so nobody has priced it. The manufacturer must add pricing tiers before it can go live.'
