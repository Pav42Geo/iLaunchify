// V1 seed for ingredient governance dictionaries.
// Idempotent — safe to re-run.
//
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4a.5 — two dictionaries:
//   - BannedIngredient: hard-block list, partner cannot save
//   - ControversialIngredient: soft-warn list, partner can save but admin notified
//
// IMPORTANT: this seed is a starter list informed by FDA enforcement history
// and common supplement-industry watch lists. It is NOT a substitute for
// legal/regulatory review. Final list before V1 launch should be vetted by
// a supplement-industry regulatory consultant (Pavel: see PARTNER_ONBOARDING.md
// §10 open item — lawyer + regulatory expert engagement).

import { PrismaClient } from '@prisma/client'

// -----------------------------------------------------------------------------
// BANNED — partner literally cannot save these. ~30 entries spanning:
//   - FDA-actioned substances (ephedra, sibutramine, etc.)
//   - Undeclared steroids + steroid analogues
//   - Undeclared pharmaceutical stimulants
//   - Certain SARMs that have been FDA-flagged
// -----------------------------------------------------------------------------

const BANNED: Array<{ name: string; cas?: string; reason: string; reference?: string }> = [
  { name: 'Ephedra', cas: '299-42-3', reason: 'FDA banned in dietary supplements (April 2004) — cardiovascular events.', reference: 'https://www.fda.gov/food/dietary-supplement-products-ingredients/dietary-supplements-containing-ephedrine-alkaloids' },
  { name: 'Ephedrine', cas: '299-42-3', reason: 'FDA banned in dietary supplements (April 2004).' },
  { name: 'Sibutramine', cas: '106650-56-0', reason: 'Withdrawn FDA-approved drug; commonly found in adulterated weight-loss supplements.' },
  { name: 'DMAA', cas: '105-41-9', reason: '1,3-Dimethylamylamine — FDA action 2013; serious cardiovascular events.' },
  { name: 'DMBA', cas: '13803-74-2', reason: '1,3-Dimethylbutylamine — FDA action 2015; structural analog of DMAA.' },
  { name: 'Methylsynephrine', cas: '365-26-4', reason: 'FDA action 2016 — synthetic stimulant marketed as natural.' },
  { name: 'Higenamine', cas: '5843-65-2', reason: 'FDA action 2019; cardiovascular concerns; WADA-prohibited.' },
  { name: 'BMPEA', cas: '17790-43-7', reason: 'Beta-methylphenylethylamine — FDA action 2015; synthetic amphetamine-like.' },
  { name: 'Octopamine', cas: '104-14-3', reason: 'WADA-prohibited stimulant; FDA enforcement on adulterated products.' },
  { name: 'Andarine', cas: '401900-40-1', reason: 'SARM — not FDA-approved for human consumption; FDA warning letters 2017+.' },
  { name: 'Ostarine', cas: '841205-47-8', reason: 'SARM (MK-2866) — not FDA-approved for human consumption.' },
  { name: 'LGD-4033', cas: '1165910-22-4', reason: 'SARM — not FDA-approved for human consumption.' },
  { name: 'Ligandrol', cas: '1165910-22-4', reason: 'Synonym for LGD-4033.' },
  { name: 'Cardarine', cas: '317318-70-0', reason: 'GW-501516 — animal carcinogen; not for human consumption.' },
  { name: 'Ibutamoren', cas: '159752-10-0', reason: 'MK-677 — not FDA-approved; growth hormone secretagogue.' },
  { name: 'YK-11', cas: '431579-34-9', reason: 'Steroidal SARM — not FDA-approved.' },
  { name: 'Methylhexanamine', cas: '105-41-9', reason: 'Synonym for DMAA.' },
  { name: 'Synephrine HCl', reason: 'High-dose synephrine — FDA cardiovascular concerns when combined with caffeine.' },
  { name: 'Yohimbe (high-dose)', cas: '146-48-5', reason: 'High-yohimbine extracts have caused cardiovascular events; FDA warning letters.' },
  { name: 'Tianeptine', cas: '66981-73-5', reason: 'Schedule II in several US states; opioid-like activity; FDA warning 2018.' },
  { name: 'Phenibut', cas: '1078-21-3', reason: 'Not FDA-approved; dependence + withdrawal risk; FDA warning letters.' },
  { name: 'Methandrostenolone', cas: '72-63-9', reason: 'Anabolic steroid; controlled substance.' },
  { name: 'Stanozolol', cas: '10418-03-8', reason: 'Anabolic steroid; controlled substance.' },
  { name: 'Trenbolone', cas: '10161-33-8', reason: 'Anabolic steroid; controlled substance.' },
  { name: 'Drostanolone', cas: '58-19-5', reason: 'Anabolic steroid; controlled substance.' },
  { name: 'Oxandrolone', cas: '53-39-4', reason: 'Anabolic steroid; controlled substance.' },
  { name: 'Methasterone', cas: '3381-88-2', reason: 'Designer anabolic steroid; controlled substance.' },
  { name: '1,4-butanediol', cas: '110-63-4', reason: 'Converts to GHB in body; controlled.' },
  { name: 'Gamma-butyrolactone', cas: '96-48-0', reason: 'GBL — converts to GHB; controlled.' },
  { name: 'Kava (root extract, high-dose)', cas: '9000-38-8', reason: 'FDA consumer advisory 2002 — severe liver injury risk at high doses.' },
]

// -----------------------------------------------------------------------------
// CONTROVERSIAL — soft warn; partner can save but admin notified.
// ~40 entries spanning borderline / situational concerns.
// -----------------------------------------------------------------------------

const CONTROVERSIAL: Array<{ name: string; cas?: string; concern: string; recommendation?: string }> = [
  { name: 'Caffeine (>300mg per serving)', concern: 'High-dose caffeine + other stimulants linked to cardiovascular events.', recommendation: 'Document evidence for high-dose use; consider adding pregnancy warning.' },
  { name: 'Kratom', cas: '146504-26-1', concern: 'FDA has not approved; FDA import alerts. State-by-state legality.', recommendation: 'Confirm state-by-state shipping legality with admin before listing.' },
  { name: 'CBD', cas: '13956-29-1', concern: 'Hemp-derived CBD legal under 2018 Farm Bill but FDA has not approved for ingestible products.', recommendation: 'COA required; state-by-state legality.' },
  { name: 'Delta-8 THC', concern: 'Synthetic conversion from CBD; FDA has not approved; state-by-state legality.', recommendation: 'Confirm state shipping legality.' },
  { name: 'Yohimbine', cas: '146-48-5', concern: 'Low-dose pharmaceutical use; high-dose supplement use has cardiovascular concerns.', recommendation: 'Lower-dose only; document evidence.' },
  { name: 'Garcinia Cambogia (high-dose)', concern: 'Liver injury case reports at high doses.', recommendation: 'Document HCA concentration; suggest lower-dose alternative.' },
  { name: 'Vinpocetine', cas: '42971-09-5', concern: 'FDA recommended against in dietary supplements 2019 — pregnancy concerns.', recommendation: 'Pregnancy/lactation warning required.' },
  { name: 'Hordenine', cas: '539-15-1', concern: 'Stimulant; not extensively studied; quality varies by source.', recommendation: 'COA + standardization claim required.' },
  { name: 'BMPEA (trace amounts)', concern: 'Even trace levels are FDA concern; ensure ingredient supplier confirms zero adulteration.' },
  { name: 'Methylsynephrine (trace amounts)', concern: 'FDA concern; verify adulteration absence.' },
  { name: 'Acacia rigidula', concern: 'Has been associated with BMPEA adulteration; verify supplier.', recommendation: 'COA showing no BMPEA contamination required.' },
  { name: 'Bitter Orange (high-dose)', cas: '90-15-3', concern: 'High-synephrine extracts have cardiovascular concerns when combined with caffeine.' },
  { name: 'St. John\'s Wort', cas: '8001-89-0', concern: 'Significant drug-drug interactions; FDA medication interaction warnings.', recommendation: 'Drug interaction warning required on label.' },
  { name: 'Kava (low-dose, properly sourced)', cas: '9000-38-8', concern: 'Properly sourced kava may be acceptable; high-dose extracts banned. Quality + dose verification required.', recommendation: 'COA + dose limits + liver warning.' },
  { name: 'Bee pollen', concern: 'Adulterated bee pollen has caused FDA enforcement (often contains undeclared weight-loss drugs).', recommendation: 'Reputable supplier verification required.' },
  { name: 'Royal jelly', concern: 'Allergen risk for bee-product-sensitive individuals.', recommendation: 'Clear allergen labeling.' },
  { name: 'Propolis', concern: 'Allergen risk for bee-product-sensitive individuals.' },
  { name: 'White willow bark', cas: '64-19-7', concern: 'Salicylate; not safe for children + people with aspirin sensitivity.', recommendation: 'Warning for children + aspirin-sensitive.' },
  { name: 'Comfrey', cas: '8001-71-6', concern: 'Hepatotoxic pyrrolizidine alkaloids; FDA advisory.', recommendation: 'External use only; never internal.' },
  { name: 'Aristolochia', cas: '475-80-9', concern: 'Nephrotoxic; FDA banned in some forms; avoid all aristolochic acid sources.' },
  { name: 'Pennyroyal oil', cas: '8007-44-1', concern: 'Severe liver toxicity; FDA advisory.' },
  { name: 'Sassafras oil', cas: '8006-80-2', concern: 'Contains safrole; FDA banned safrole as food additive 1960.' },
  { name: 'Maximum-dose niacin (>500mg)', cas: '59-67-6', concern: 'Hepatotoxicity at high doses; flushing reaction.', recommendation: 'Lower-dose form (inositol hexanicotinate) preferred.' },
  { name: 'Iodine (>1100mcg)', cas: '7553-56-2', concern: 'Tolerable upper intake level per IOM; thyroid risk.', recommendation: 'Document medical-supervision claim or lower dose.' },
  { name: 'Vitamin A (>10000IU retinol)', concern: 'Hypervitaminosis A risk; pregnancy teratogen.', recommendation: 'Pregnancy warning; document for dose >10000IU.' },
  { name: 'Vitamin D3 (>5000IU)', concern: 'Hypercalcemia risk at chronic high doses.', recommendation: 'Document medical-supervision claim.' },
  { name: 'Iron (>45mg, non-medical)', concern: 'Iron poisoning risk in children.', recommendation: 'Child-resistant packaging required (16 CFR 1700).' },
  { name: 'L-arginine (high-dose)', cas: '74-79-3', concern: 'Cardiovascular concerns in post-MI patients.', recommendation: 'Caution-statement for cardiac patients.' },
  { name: 'Glutathione (oral, high-dose)', concern: 'Limited evidence of oral absorption; consumer-protection issue more than safety.' },
  { name: 'Resveratrol (>500mg)', cas: '501-36-0', concern: 'Limited long-term data at high doses.' },
  { name: 'Curcumin (high-dose, low-bioavailability formulation)', concern: 'Marketing claims often exceed evidence; high-dose hepatotoxicity case reports.' },
  { name: 'Berberine', cas: '2086-83-1', concern: 'Significant drug-drug interactions; CYP3A4 inhibition.', recommendation: 'Drug interaction warning.' },
  { name: 'Tongkat ali (Eurycoma longifolia)', concern: 'Variable quality; mercury contamination has been documented.', recommendation: 'Heavy-metals COA required.' },
  { name: 'Ashwagandha (root extract, high-dose)', cas: '5119-48-2', concern: 'Some hepatotoxicity case reports; thyroid hormone effects.' },
  { name: 'Tribulus terrestris', concern: 'Often adulterated with steroids; mixed efficacy evidence.' },
  { name: 'Horny goat weed (icariin extract)', cas: '489-32-7', concern: 'Has been adulterated with PDE5 inhibitors; FDA enforcement.' },
  { name: 'Black cohosh', cas: '84776-26-1', concern: 'Hepatotoxicity case reports; FDA reviewing.', recommendation: 'Liver-warning statement recommended.' },
  { name: 'Hoodia gordonii', concern: 'Often adulterated; CITES-listed plant requires legal sourcing documentation.', recommendation: 'CITES sourcing documentation required.' },
  { name: 'GHRP-6 / GHRP-2 / Ipamorelin (oral form)', concern: 'These are research peptides; not FDA-approved as supplements.' },
  { name: 'Melatonin (>5mg)', cas: '73-31-4', concern: 'Standard supplement doses (0.3-5mg) effective; high doses linked to side effects.', recommendation: 'Lower-dose recommendation; document need for >5mg.' },
]

// -----------------------------------------------------------------------------
// Main seed
// -----------------------------------------------------------------------------

export async function seedIngredientDictionaries(prisma: PrismaClient) {
  console.log('Seeding ingredient governance dictionaries (banned + controversial)...')

  for (const item of BANNED) {
    // Use matchName as natural key for upsert idempotency
    const existing = await prisma.bannedIngredient.findFirst({ where: { matchName: item.name } })
    if (!existing) {
      await prisma.bannedIngredient.create({
        data: {
          matchName: item.name,
          casNumber: item.cas,
          reason: item.reason,
          reference: item.reference,
          isActive: true,
        },
      })
    }
  }

  for (const item of CONTROVERSIAL) {
    const existing = await prisma.controversialIngredient.findFirst({ where: { matchName: item.name } })
    if (!existing) {
      await prisma.controversialIngredient.create({
        data: {
          matchName: item.name,
          casNumber: item.cas,
          concern: item.concern,
          recommendation: item.recommendation,
          isActive: true,
        },
      })
    }
  }

  console.log(`Seeded ${BANNED.length} banned + ${CONTROVERSIAL.length} controversial ingredients.`)
}
