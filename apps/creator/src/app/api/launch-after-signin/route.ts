// REBUILD R4 — second leg of the guest-gate flow.
//
// The guest signs in through the real creator /login (magic-link / Google),
// which then redirects here (its callbackUrl) with the launch params in the
// query string. Now that the user is signed in, create the Product row and
// redirect to the Design Studio canvas.
//
// Flow:
//   GuestGateModal (apps/marketing)
//     → signupGuestAndPrepareLaunch (server action)
//       creates User + CreatorProfile + Brand
//     → returns signinUrl = /login?callbackUrl=this-route
//   creator /login (real magic-link / Google — no bypass, H5 A2)
//     → establishes the session + redirects to this route
//   /api/launch-after-signin (this file)
//     → has the session, runs the same product-creation logic
//       as startLaunchFromTemplate, redirects to the canvas
//
// Mirrors apps/marketing/src/lib/launch-actions.ts intentionally —
// kept here as a route handler instead of a server action because we
// need it to run after the sign-in redirect chain establishes the session.

import { NextRequest, NextResponse } from 'next/server'
import { prisma, getOrCreateDefaultBrand } from '@ilaunchify/db'
import { auth } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth().catch(() => null)
  if (!session?.user?.id || session.user.role !== 'CREATOR') {
    // Session didn't land — bounce to /login. Shouldn't happen in the normal
    // flow because sign-in just established it before redirecting here.
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const userId = session.user.id

  const params = req.nextUrl.searchParams
  const templateSlug = params.get('template')
  if (!templateSlug) {
    return NextResponse.redirect(new URL('/dashboard?error=missing-template', req.url))
  }

  // Brand is OPTIONAL for the creator, but Product.brandId is required — so use
  // their first brand, lazily creating a quiet default if they have none. This
  // lets a brand-new signup land straight in the Studio with their picked
  // product instead of being detoured through brand setup (Pavel 2026-06-22).
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!profile) {
    return NextResponse.redirect(new URL('/dashboard?error=no-profile', req.url))
  }
  const { brandId } = await getOrCreateDefaultBrand(profile.id)

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
      where: { brandId, slug },
      select: { id: true },
    })
  ) {
    collision++
    slug = `${baseSlug}-${collision}`
  }

  try {
    const product = await prisma.product.create({
      data: {
        brandId,
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

    // #22 (2026-07-19) — ALWAYS materialise the PRIMARY container UPSTREAM so it is
    // chosen here, never for the first time at checkout (mirrors launch-actions.ts).
    // Source order: a PDP-picked offering (carries method + dieline), else the
    // container the variant already carries, UNDECORATED — the Studio decoration
    // pick later sets offering + method + dieline on THIS row. Never breaks launch.
    const partnerOfferingId = params.get('partnerOfferingId')
    try {
      let containerData:
        | {
            packagingTypeId: string
            partnerOfferingId?: string
            dielineId?: string | null
            decorationMethod?: import('@ilaunchify/db').DecorationMethod
          }
        | null = null

      if (partnerOfferingId) {
        const offering = await prisma.partnerPackagingOffering.findFirst({
          where: { id: partnerOfferingId, status: 'ACTIVE' },
          select: { id: true, packagingTypeId: true, dielineId: true, decorationMethod: true },
        })
        if (offering) {
          containerData = {
            packagingTypeId: offering.packagingTypeId,
            partnerOfferingId: offering.id,
            dielineId: offering.dielineId,
            decorationMethod: offering.decorationMethod,
          }
        }
      }
      if (!containerData && variant.packagingTypeId) {
        containerData = { packagingTypeId: variant.packagingTypeId }
      }

      if (containerData) {
        await prisma.packagingComponent.create({
          data: {
            productId: product.id,
            tier: 'PRIMARY',
            role: 'CONTAINER',
            unitsPerParent: 1,
            displayOrder: 0,
            ...containerData,
          },
        })
      }
    } catch (compErr) {
      console.warn(
        '[launch-after-signin] PackagingComponent seed failed — launch continues:',
        compErr,
      )
    }

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
