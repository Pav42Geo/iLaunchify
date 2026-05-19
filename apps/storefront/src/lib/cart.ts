// Cart helpers.
//
// V1 guest carts use a session-cookie token. The Cart row's sessionToken
// matches the cookie value. TTL: 7 days, refreshed on every interaction.
//
// V1.5+ adds magic-link consumer accounts, at which point Cart.consumerUserId
// is populated and the session cookie can be detached.

import { prisma } from '@ilaunchify/db'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

const COOKIE_NAME = 'ilf_cart'
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60   // 7 days

interface CartCookieValue {
  token: string
}

export async function getCartToken(): Promise<string> {
  const store = await cookies()
  const existing = store.get(COOKIE_NAME)?.value
  if (existing) return existing

  const token = randomUUID()
  store.set(COOKIE_NAME, token, {
    maxAge: COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  return token
}

/**
 * Get or create the cart for the current session + brand. Single-brand-per-cart
 * is enforced by including brandId in the lookup — visiting a second brand's
 * storefront creates a separate Cart row keyed to the same sessionToken.
 */
export async function getOrCreateCart(brandId: string) {
  const token = await getCartToken()

  // Look for an existing active cart for this brand
  const existing = await prisma.cart.findFirst({
    where: {
      sessionToken: token,
      brandId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    include: { items: { include: { product: true } } },
  })
  if (existing) return existing

  // Create a new cart
  return prisma.cart.create({
    data: {
      sessionToken: token,
      brandId,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000),
    },
    include: { items: { include: { product: true } } },
  })
}

export async function getCurrentCart(brandId: string) {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null

  return prisma.cart.findFirst({
    where: { sessionToken: token, brandId, status: 'ACTIVE' },
    include: { items: { include: { product: true } } },
  })
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
