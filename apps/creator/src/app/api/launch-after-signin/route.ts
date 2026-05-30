// REBUILD R4 — second leg of the guest-gate flow.
//
// /api/dev/login sets the session cookie + redirects here with the
// launch params in the query string. Now that the user is signed in,
// create the Product row and redirect to the Design Studio canvas.
//
// Flow:
//   GuestGateModal (apps/marketing)
//     → signupGuestAndPrepareLaunch (server action)
//       creates User + CreatorProfile + Brand
//     → returns signinUrl = /api/dev/login?email=…&callbackUrl=this-route
//   /api/dev/login
//     → sets session cookie + redirects to this route
//   /api/launch-after-signin (this file)
//     → has the fresh session, runs the same product-creation logic
//       as startLaunchFromTemplate, redirects to the canvas
//
// Mirrors apps/marketing/src/lib/launch-actions.ts intentionally —
// kept here as a route handler instead of a server action because we
// need it to run after a cross-origin cookie hand-off and the dev-login
// redirect chain.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { auth } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth().catch(() => null)
  if (!session?.user?.id || session.user.role !== 'CREATOR') {
    // Session cookie didn't land — bounce to /login. Shouldn't happen
    // in the normal flow because /api/dev/login set it just now.
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const userId = session.user.id

  const params = req.nextUrl.searchParams
  const templateSlug = params.get('template')
  if (!templateSlug) {
    return NextResponse.redirect(new URL('/dashboard?error=missing-template', req.url))
  }

  // Resolve brand (the guest-gate action just created one for new
  // signups; existing users use their first brand).
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    include: { brands: { orderBy: { createdAt: 'asc' }, take: 1 } },
  })
  const brand = profile?.brands[0]
  if (!brand) {
    return NextResponse.redirect(new URL('/onboarding/brand', req.url))
  }

  // Same template resolution as launch-actions.ts: prefer the exact
  // slug, fall back to the first PUBLISHED template so the demo flow
  // works even when the marketing fixture doesn't have a DB twin.
  let template = await prisma.productTemplate.findFirst({
    where: { slug: templateSlug, status: 'PUBLISHED' },
    include: {
      subcategory: { include: { category: true } },
      variants: { where: { isActive: true }, take: 1 },
    },
  })
  if (!template) {
    template = await prisma.productTemplate.findFirst({
      where: { status: 'PUBLISHED' },
      include: {
        subcategory: { include: { category: true } },
        variants: { where: { isActive: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!template) {
    return NextResponse.redirect(new URL('/dashboard?error=no-templates', req.url))
  }
  const variant = template.variants[0]
  if (!variant) {
    return NextResponse.redirect(new URL('/dashboard?error=no-variant', req.url))
  }

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) {
    return NextResponse.redirect(new URL('/dashboard?error=no-market', req.url))
  }

  const productCategory =
    template.subcategory.category.mainCategory === 'Supplements'
      ? 'SUPPLEMENT'
      : template.subcategory.category.mainCategory === 'Beverages'
        ? 'BEVERAGE_FUNCTIONAL'
        : 'FOOD'

  // Unique slug per brand.
  const baseSlug =
    template.slug + (variant.flavor ? `-${slugify(variant.flavor)}` : '')
  let slug = baseSlug
  let collision = 1
  while (
    await prisma.product.findFirst({
      where: { brandId: brand.id, slug },
      select: { id: true },
    })
  ) {
    collision++
    slug = `${baseSlug}-${collision}`
  }

  try {
    const product = await prisma.product.create({
      data: {
        brandId: brand.id,
        productTemplateId: template.id,
        variantId: variant.id,
        marketId: market.id,
        name: template.name + (variant.flavor ? ` — ${variant.flavor}` : ''),
        slug,
        category: productCategory,
        status: 'DRAFT',
      },
      select: { id: true },
    })
    return NextResponse.redirect(
      new URL(`/products/${product.id}/design/canvas`, req.url),
    )
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        `/dashboard?error=create-failed&detail=${encodeURIComponent((err as Error).message)}`,
        req.url,
      ),
    )
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
