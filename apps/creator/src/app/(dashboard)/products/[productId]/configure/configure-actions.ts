'use server'

// =============================================================================
// Product Spec Sheet (#6) — freeze an immutable, versioned snapshot of a
// configured SKU. docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §6.
// =============================================================================
//
// ProductSpecSheet is template-scoped + @@unique([productTemplateId, version]),
// so each issue takes the next global version for the template. The snapshot
// records which product/creator configured it, the resolved flavor + options,
// the §9 quote, and the recomputed Facts panel — the "snapshot-for-legal-
// reproducibility" artifact.
//
// The model may be ungenerated on a given machine until the migration runs, so
// writes go through a loose delegate + cast and fail soft.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import type { SpecSheetSnapshot } from './spec-sheet-types'

type Result = { ok: true; version: number } | { ok: false; error: string }

export async function issueProductSpecSheet(input: {
  productId: string
  snapshot: SpecSheetSnapshot
}): Promise<Result> {
  const user = await requireUser()

  // Ownership + template binding.
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, productTemplateId: true },
  })
  if (!product?.productTemplateId) return { ok: false, error: 'Product not found.' }
  const templateId = product.productTemplateId

  if (!input.snapshot.quote.valid) {
    return { ok: false, error: 'Fix the highlighted issues before issuing a spec sheet.' }
  }

  const loose = prisma as unknown as {
    productSpecSheet?: {
      findFirst: (a: unknown) => Promise<{ version: number } | null>
      updateMany: (a: unknown) => Promise<unknown>
      create: (a: unknown) => Promise<{ version: number }>
    }
  }
  if (!loose.productSpecSheet) {
    return { ok: false, error: 'Spec sheets aren’t available yet — run the pending migration.' }
  }

  // Next global version for this template.
  const latest = await loose.productSpecSheet
    .findFirst({
      where: { productTemplateId: templateId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    .catch(() => null)
  const version = (latest?.version ?? 0) + 1

  try {
    // Supersede prior ISSUED snapshots for this template, then issue the new one.
    await loose.productSpecSheet.updateMany({
      where: { productTemplateId: templateId, status: 'ISSUED' },
      data: { status: 'SUPERSEDED' },
    })
    await loose.productSpecSheet.create({
      data: {
        productTemplateId: templateId,
        version,
        status: 'ISSUED',
        snapshot: input.snapshot as unknown as object,
        generatedById: user.id,
      },
    })
  } catch (e) {
    return { ok: false, error: 'Could not issue the spec sheet. Try again.' }
  }

  await logAuditAs(user, {
    entityType: 'ProductTemplate',
    entityId: templateId,
    action: 'product-spec-sheet.issued',
    payload: {
      version,
      productId: product.id,
      quantity: input.snapshot.quantity,
      subtotalCents: input.snapshot.quote.subtotalCents,
      optionCount: input.snapshot.options.length,
    },
  })

  revalidatePath(`/products/${product.id}/configure`)
  revalidatePath(`/products/${product.id}/spec-sheet`)
  return { ok: true, version }
}
