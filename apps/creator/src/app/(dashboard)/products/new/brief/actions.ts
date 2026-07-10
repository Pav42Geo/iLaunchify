'use server'

// Co-creation Brief Builder — server actions (CO_CREATION_MARKETPLACE_SPEC §16 P0).
// Ownership + tier gates run HERE (server), not just in the page — tenant
// isolation is threat #1 (SECURITY_ARCHITECTURE.md). Status changes go through
// assertBriefTransition (packages/orders) and every mutation writes AuditLog.

import { prisma } from '@ilaunchify/db'
import { requireUser, getEffectiveCreatorTier, hasTier } from '@ilaunchify/auth'
import { assertBriefTransition } from '@ilaunchify/orders'
import { logAuditAs } from '@ilaunchify/audit'
import { z } from 'zod'

const IngredientRowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.string().trim().max(40).optional().default(''),
  note: z.string().trim().max(120).optional().default(''),
})

const PostBriefSchema = z.object({
  origin: z.enum(['HAVE_RECIPE', 'HAVE_IDEA']),
  title: z.string().trim().min(3, 'Give your product a name').max(120),
  nicheSlug: z.string().min(1, 'Pick a niche'),
  categoryId: z.string().min(1, 'Pick a category'),
  claims: z.array(z.string().trim().min(1).max(40)).max(12),
  formulationMode: z.enum(['CREATOR_PROVIDED', 'MAKER_FORMULATES']),
  targetVolume: z.number().int().positive().max(100_000_000).nullable(),
  budgetLow: z.number().positive().max(1_000_000).nullable(),
  budgetHigh: z.number().positive().max(1_000_000).nullable(),
  timelineWeeks: z.number().int().positive().max(520).nullable(),
  // PRIVATE payload — staged reveal (§9). Never enters the public projection.
  ingredients: z.array(IngredientRowSchema).max(60).optional().default([]),
  keyIngredients: z.string().trim().max(500).optional().default(''),
  privateNotes: z.string().trim().max(2000).optional().default(''),
})

export type PostBriefInput = z.infer<typeof PostBriefSchema>
export type PostBriefResult =
  | { ok: true; briefId: string }
  | { ok: false; error: string }

/**
 * Create the brief and take it live in the Opportunity Pool:
 * DRAFT → POSTED → INTEREST_OPEN, each edge FSM-asserted + audited.
 * D-CC1: co-creation access is a Builder/Agency feature — enforced here.
 */
export async function postBrief(input: PostBriefInput): Promise<PostBriefResult> {
  const user = await requireUser()
  if (user.role !== 'CREATOR' && user.role !== 'ADMIN') {
    return { ok: false, error: 'Only creators can post briefs' }
  }

  // D-CC1 tier gate (server-side; the page also gates for UX).
  const tier = await getEffectiveCreatorTier(user)
  if (!hasTier(tier, 'builder')) {
    return { ok: false, error: 'Co-creation briefs are a Builder feature — upgrade your plan to post one.' }
  }

  const parsed = PostBriefSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }
  const data = parsed.data

  if (data.budgetLow !== null && data.budgetHigh !== null && data.budgetHigh < data.budgetLow) {
    return { ok: false, error: 'Budget range is inverted' }
  }

  const profile = await prisma.creatorProfile.findUnique({ where: { userId: user.id } })
  if (!profile) return { ok: false, error: 'Complete creator onboarding first' }

  // Validate taxonomy server-side: niche must be one of the 8 locked actives,
  // category one of the 13 locked actives (D-CC7: all 13 open).
  const [niche, category] = await Promise.all([
    prisma.niche.findFirst({ where: { slug: data.nicheSlug, isActive: true } }),
    prisma.category.findFirst({ where: { id: data.categoryId, isActive: true } }),
  ])
  if (!niche) return { ok: false, error: 'Unknown niche' }
  if (!category) return { ok: false, error: 'Unknown category' }

  // Derive the label DOMAIN enum from the picked category (same mapping as
  // products/new). Layer-2 truth lives on categoryId; this enum is the domain.
  const lt = category.labelingType
  const domain =
    lt === 'DIETARY_SUPPLEMENT'
      ? 'SUPPLEMENT'
      : lt === 'COSMETIC'
        ? 'COSMETIC'
        : lt === 'PET_PRODUCT'
          ? 'PET'
          : category.mainCategory === 'Beverages'
            ? 'BEVERAGE_FUNCTIONAL'
            : 'FOOD'

  // Private formula payload only makes sense on the recipe door.
  const privateFormula =
    data.origin === 'HAVE_RECIPE' && data.ingredients.length > 0
      ? { rows: data.ingredients }
      : data.keyIngredients
        ? { keyIngredients: data.keyIngredients }
        : undefined

  // FSM edges asserted up front (pure guards), then one transaction.
  assertBriefTransition('DRAFT', 'POSTED')
  assertBriefTransition('POSTED', 'INTEREST_OPEN')

  const brief = await prisma.productBrief.create({
    data: {
      creatorId: profile.id,
      origin: data.origin,
      status: 'INTEREST_OPEN',
      title: data.title,
      nicheSlug: niche.slug,
      category: domain,
      categoryId: category.id,
      claims: data.claims,
      targetVolume: data.targetVolume,
      budgetLow: data.budgetLow,
      budgetHigh: data.budgetHigh,
      timelineWeeks: data.timelineWeeks,
      formulationMode: data.formulationMode,
      privateFormula,
      privateNotes: data.privateNotes || null,
    },
  })

  await logAuditAs(user, {
    entityType: 'ProductBrief',
    entityId: brief.id,
    action: 'BRIEF_CREATED',
    payload: { title: data.title, origin: data.origin, nicheSlug: niche.slug, categoryId: category.id },
  })
  await logAuditAs(user, {
    entityType: 'ProductBrief',
    entityId: brief.id,
    action: 'BRIEF_POSTED',
    fromValue: 'DRAFT',
    toValue: 'INTEREST_OPEN',
    payload: {
      claims: data.claims,
      targetVolume: data.targetVolume,
      timelineWeeks: data.timelineWeeks,
      hasPrivateFormula: !!privateFormula,
    },
  })

  return { ok: true, briefId: brief.id }
}
