'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const Schema = z.object({
  productId: z.string(),
  priceCents: z.number().int().positive(),
  inventoryAvailable: z.number().int().positive().nullable(),
})

export async function publishProduct(input: z.infer<typeof Schema>) {
  const user = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0].message }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      recipe: {
        include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  })
  if (!product) return { ok: false as const, error: 'Product not found' }

  const lastCheck = product.recipe?.complianceChecks[0]
  if (!lastCheck || lastCheck.outcome === 'FAILED') {
    return {
      ok: false as const,
      error: 'Compliance violations must be resolved before publishing',
    }
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      priceCents: parsed.data.priceCents,
      inventoryAvailable: parsed.data.inventoryAvailable,
      status: 'PUBLISHED',
    },
  })

  revalidatePath(`/products/${product.id}`)
  return { ok: true as const }
}
