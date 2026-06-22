// @ilaunchify/marketplace — deterministic niche auto-suggest engine.
// Slice 3A. Spec: docs/MARKETPLACE_DESIGN.md §2 + memory note
// ilaunchify-marketplace-decisions-2026-06-01.md.
//
// One ProductTemplate flows through every active NicheRule. Each rule's
// `conditions` JSON is an array of {kind, values[]} rows — AND across rows,
// OR within values. The MATCHING + DEDUPE logic lives in the pure
// ./niche-rule-eval module (shared with the unit tests); this file only loads
// the data and hands it to the evaluator.
//
// Server-side only — relies on the @ilaunchify/db Prisma client.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import type { SuggestNichesInput, SuggestNichesResult } from './types'
import { evaluateRules, type NicheFacts, type EvaluableRule } from './niche-rule-eval'

/**
 * Pull the ProductTemplate + the four fact-shaped relations the rule kinds
 * read against. Returned shape is intentionally narrow so callers don't
 * accidentally couple to model details.
 */
async function loadProductFacts(productTemplateId: string): Promise<NicheFacts | null> {
  const product = await prisma.productTemplate.findUnique({
    where: { id: productTemplateId },
    include: {
      subcategory: { include: { category: true } },
      certificates: {
        include: { instance: { include: { certificateType: true } } },
      },
      lifestyleTags: { include: { lifestyleTag: true } },
    },
  })
  if (!product) return null

  return {
    labelingType: product.labelingType,
    categorySlug: product.subcategory?.category?.slug ?? null,
    subcategorySlug: product.subcategory?.slug ?? null,
    certSlugs: new Set(
      product.certificates
        .map((c) => c.instance?.certificateType?.slug)
        .filter((s): s is string => !!s),
    ),
    lifestyleTagSlugs: new Set(
      product.lifestyleTags
        .map((t) => t.lifestyleTag?.slug)
        .filter((s): s is string => !!s),
    ),
  }
}

/**
 * Suggest niches for a product template by evaluating every active NicheRule.
 *
 * Algorithm (matching + dedupe in ./niche-rule-eval):
 *   1. Load product facts (labelingType, category/subcategory slugs, cert
 *      slugs, lifestyle-tag slugs).
 *   2. Load every active NicheRule (with its Niche).
 *   3. `evaluateRules` ANDs conditions / ORs values, builds one suggestion per
 *      matching rule, dedupes by nicheId (highest weight wins; locked sticks),
 *      and sorts by weight desc then nicheName asc.
 *
 * Returns an empty `suggestions` array if the product doesn't exist or no rule
 * matched. `rawHits` is always populated for debug + audit payloads.
 */
export async function suggestNiches(
  input: SuggestNichesInput,
): Promise<SuggestNichesResult> {
  const facts = await loadProductFacts(input.productTemplateId)
  if (!facts) return { suggestions: [], rawHits: [] }

  const rules = await prisma.nicheRule.findMany({
    where: { isActive: true },
    include: { niche: true },
  })

  const evaluable: EvaluableRule[] = rules.map((rule) => ({
    id: rule.id,
    slug: rule.slug,
    nicheId: rule.nicheId,
    nicheSlug: rule.niche.slug,
    nicheName: rule.niche.name,
    description: rule.description,
    weight: rule.weight,
    isLocked: rule.isLocked,
    isActive: true, // query already filtered isActive
    conditions: rule.conditions,
  }))

  return evaluateRules(evaluable, facts)
}
