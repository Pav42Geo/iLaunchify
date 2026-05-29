'use server'

// REBUILD R5 — server action that turns a marketplace template selection
// into a real Product row and returns a cross-app URL to the Design
// Studio canvas.
//
// V1 cut: takes only the template slug. Real flavor/size/packaging
// pickers will pass through here once R3 ships the customize rail and
// R5 evolves to accept the full selection shape.
//
// Auth: signed-in CREATOR required. Guests get a redirect to
// /signup with a return URL preserved (R4 will polish this gate with
// a modal).

import { prisma } from '@ilaunchify/db'
import { auth } from '@ilaunchify/auth'
import { creatorUrl } from './app-urls'

export interface StartLaunchInput {
  /** Template slug from the marketplace detail URL. */
  templateSlug: string
  /** Optional V1 selection params — pass-through for now, R3 fills them in. */
  flavor?: string
  size?: string
  packaging?: string
  quantity?: number
}

export type StartLaunchResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'GUEST'; signupUrl: string }
  | { ok: false; reason: 'NO_BRAND' }
  | { ok: false; reason: 'TEMPLATE_NOT_FOUND' }
  | { ok: false; reason: 'NO_VARIANT' }
  | { ok: false; reason: 'INTERNAL'; message: string }

export async function startLaunchFromTemplate(
  input: StartLaunchInput,
): Promise<StartLaunchResult> {
  if (!process.env.AUTH_SECRET) {
    return { ok: false, reason: 'INTERNAL', message: 'AUTH not configured' }
  }

  let session
  try {
    session = await auth()
  } catch {
    session = null
  }

  // Guest → bounce to signup with a return URL so we land back on the
  // detail page after sign-in. R4 polishes this with an inline modal.
  if (!session?.user?.id || session.user.role !== 'CREATOR') {
    const params = new URLSearchParams({ template: input.templateSlug })
    if (input.flavor) params.set('flavor', input.flavor)
    if (input.size) params.set('size', input.size)
    if (input.packaging) params.set('packaging', input.packaging)
    if (input.quantity) params.set('quantity', String(input.quantity))
    return {
      ok: false,
      reason: 'GUEST',
      signupUrl: creatorUrl('/signup', Object.fromEntries(params)),
    }
  }

  const userId = session.user.id

  // Creator must have at least one brand to attach the Product to.
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId },
    include: {
      brands: {
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  })
  if (!profile) return { ok: false, reason: 'NO_BRAND' }
  const brand = profile.brands[0]
  if (!brand) return { ok: false, reason: 'NO_BRAND' }

  // Resolve the ProductTemplate. V1 marketing uses sample fixtures that
  // may not have matching DB rows yet — fall back to the first
  // PUBLISHED template in the same category so the canvas can still
  // open. R3 will tighten this to a strict match once the DB seed
  // includes the marketplace catalog.
  let template = await prisma.productTemplate.findFirst({
    where: { slug: input.templateSlug, status: 'PUBLISHED' },
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
  if (!template) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' }
  const variant = template.variants[0]
  if (!variant) return { ok: false, reason: 'NO_VARIANT' }

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: 'US market row missing — run seed',
    }
  }

  // Category enum mapping (same as createDraftFromTemplate).
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
        // Recipe is created lazily by the customize / canvas flow.
      },
      select: { id: true },
    })
    return {
      ok: true,
      url: creatorUrl(`/products/${product.id}/design/canvas`),
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'INTERNAL',
      message: (err as Error).message,
    }
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
