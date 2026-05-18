'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { z } from 'zod'

const InputSchema = z.object({
  name: z.string().min(2).max(80),
  category: z.enum(['FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT']),
  description: z.string().max(500).optional(),
  brandId: z.string(),
  marketId: z.string(),
})

export type CreateProductResult =
  | { ok: true; productId: string }
  | { ok: false; error: string }

export async function createProduct(input: z.infer<typeof InputSchema>): Promise<CreateProductResult> {
  const user = await requireUser()
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  // Verify the brand belongs to this creator
  const brand = await prisma.brand.findFirst({
    where: { id: parsed.data.brandId, creatorProfile: { userId: user.id } },
  })
  if (!brand) return { ok: false, error: 'Brand not found or not yours' }

  const slug = slugify(parsed.data.name)
  // Ensure unique slug per brand
  const existing = await prisma.product.findFirst({
    where: { brandId: brand.id, slug },
  })
  if (existing) return { ok: false, error: 'A product with that name already exists in this brand' }

  const product = await prisma.product.create({
    data: {
      brandId: brand.id,
      marketId: parsed.data.marketId,
      slug,
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category,
      status: 'DRAFT',
      recipe: {
        create: {
          status: 'DRAFT',
          servingsPerContainer: 30,
          servingSizeG: 5,
        },
      },
    },
  })

  return { ok: true, productId: product.id }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
