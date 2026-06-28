'use server'

// Category review — resolve a product draft a manufacturer imported whose category
// had no iLaunchify match. The draft is parked under the partner's default category
// with `needsCategoryReview = true` + the manufacturer's `suggestedCategoryName`.
// An admin re-files it to a real subcategory (or, out of band, creates a new
// category first, then assigns it here). Mirrors the packaging-review flow.
// Gated on catalog:write (marketplace taxonomy authority). All transitions audited.

import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

/** Assign a real subcategory + clear the review flag. */
export async function resolveCategoryReview(input: { id: string; subcategoryId: string }): Promise<Result> {
  const actor = await requireCapability('catalog:write')
  if (!input.subcategoryId) return { ok: false, error: 'Pick a category.' }

  const tmpl = await (
    prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{ id: string; needsCategoryReview: boolean; suggestedCategoryName: string | null } | null>
      }
    }
  ).productTemplate
    .findUnique({ where: { id: input.id }, select: { id: true, needsCategoryReview: true, suggestedCategoryName: true } })
    .catch(() => null)
  if (!tmpl) return { ok: false, error: 'Product not found.' }
  if (!tmpl.needsCategoryReview) return { ok: false, error: 'Already resolved.' }

  const sub = await prisma.subcategory.findUnique({ where: { id: input.subcategoryId }, select: { id: true } })
  if (!sub) return { ok: false, error: 'Category not found.' }

  await (
    prisma as unknown as { productTemplate: { update: (a: unknown) => Promise<unknown> } }
  ).productTemplate.update({
    where: { id: tmpl.id },
    data: { subcategoryId: input.subcategoryId, needsCategoryReview: false },
  })

  await logAuditAs(actor, {
    entityType: 'ProductTemplate',
    entityId: tmpl.id,
    action: 'CATEGORY_REVIEW_RESOLVED',
    toValue: input.subcategoryId,
    payload: { suggested: tmpl.suggestedCategoryName },
  })

  revalidatePath('/categories/review')
  return { ok: true }
}
