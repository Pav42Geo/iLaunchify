'use server'

import { prisma } from '@ilaunchify/db'
import { revalidatePath } from 'next/cache'
import { getOrCreateCart } from '@/lib/cart'
import { z } from 'zod'

const AddSchema = z.object({
  brandId: z.string(),
  productId: z.string(),
  quantity: z.number().int().positive().max(99),
})

type Result = { ok: true } | { ok: false; error: string }

export async function addToCart(input: z.infer<typeof AddSchema>): Promise<Result> {
  const parsed = AddSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, brandId: parsed.data.brandId, status: 'PUBLISHED' },
  })
  if (!product) return { ok: false, error: 'Product not available' }

  // Inventory check
  if (product.inventoryAvailable !== null && product.inventoryAvailable < parsed.data.quantity) {
    return { ok: false, error: 'Not enough inventory' }
  }

  const cart = await getOrCreateCart(parsed.data.brandId)

  // Upsert the line item — if product already in cart, add to its quantity
  const existing = cart.items.find((i) => i.productId === product.id)
  if (existing) {
    const newQty = existing.quantity + parsed.data.quantity
    if (product.inventoryAvailable !== null && newQty > product.inventoryAvailable) {
      return { ok: false, error: 'Not enough inventory' }
    }
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: {
        quantity: newQty,
        priceAtAddCents: product.priceCents,
      },
    })
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        quantity: parsed.data.quantity,
        priceAtAddCents: product.priceCents,
      },
    })
  }

  // Touch the cart's updatedAt
  await prisma.cart.update({
    where: { id: cart.id },
    data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  })

  // Revalidate the brand layout so the cart count badge updates
  revalidatePath(`/${cart.brandId}`, 'layout')

  return { ok: true }
}

const UpdateSchema = z.object({
  cartItemId: z.string(),
  quantity: z.number().int().min(0).max(99),
})

export async function updateCartItemQuantity(input: z.infer<typeof UpdateSchema>): Promise<Result> {
  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message }

  const item = await prisma.cartItem.findUnique({
    where: { id: parsed.data.cartItemId },
    include: { product: true, cart: true },
  })
  if (!item) return { ok: false, error: 'Item not found' }

  if (
    item.product.inventoryAvailable !== null &&
    parsed.data.quantity > item.product.inventoryAvailable
  ) {
    return { ok: false, error: 'Not enough inventory' }
  }

  if (parsed.data.quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } })
  } else {
    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: parsed.data.quantity },
    })
  }

  revalidatePath(`/cart`)
  return { ok: true }
}

export async function removeFromCart({ cartItemId }: { cartItemId: string }): Promise<Result> {
  await prisma.cartItem.delete({ where: { id: cartItemId } }).catch(() => {/* idempotent */})
  return { ok: true }
}
