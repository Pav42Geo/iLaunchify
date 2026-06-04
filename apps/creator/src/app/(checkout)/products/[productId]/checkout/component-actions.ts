'use server'

// Track C / C7.d — multi-component packaging server actions (creator-side).
//
// Mutation primitives over a Product's PackagingComponent rows:
//   listProductComponents   — read the component tree (display order)
//   addPackagingComponent    — add a slot (explicit packagingType + role/tier)
//   setComponentVariant      — pick / clear the decoration variant for a slot
//   removePackagingComponent — delete a slot, BLOCKED for FDA-mandatory seals
//
// Every mutation is creator-scoped (the product must belong to the caller's
// brand) and writes an AuditLog row via @ilaunchify/audit.
//
// Auto-seeding the implied slots (createDefaultComponentSlots via
// impliedComponentSlots) waits on admin-curated cap/seal PackagingTypes — the
// required packagingTypeId for a CLOSURE/SEAL slot comes from that catalog,
// which isn't populated yet. The pure rule helper lives in ./component-slots.

import { prisma } from '@ilaunchify/db'
import type {
  ComponentRole,
  ContainerCategory,
  DecorationMethod,
  LabelingType,
  PackagingTier,
} from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'
import { impliedComponentSlots, sealIsFdaMandatory } from './component-slots'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

async function authorizeProduct(productId: string) {
  const user = await requireUser()
  if (user.role !== 'CREATOR') {
    return { user: null, product: null, error: 'NOT_A_CREATOR' as const }
  }
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      id: true,
      productTemplate: { select: { labelingType: true } },
    },
  })
  if (!product) return { user, product: null, error: 'NOT_YOUR_PRODUCT' as const }
  return { user, product, error: null as null }
}

export interface ComponentRow {
  id: string
  tier: PackagingTier
  role: ComponentRole
  packagingTypeId: string
  decorationMethod: DecorationMethod
  selectedVariantId: string | null
  parentComponentId: string | null
  displayOrder: number
  /** True when this is an FDA-mandatory seal — UI disables removal. */
  fdaLocked: boolean
}

export async function listProductComponents(
  productId: string,
): Promise<Result<ComponentRow[]>> {
  const { product, error } = await authorizeProduct(productId)
  if (!product) return { ok: false, error: error ?? 'NOT_FOUND' }

  const sealLocked = sealIsFdaMandatory(product.productTemplate?.labelingType ?? 'FOOD')
  const rows = await prisma.packagingComponent.findMany({
    where: { productId },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      tier: true,
      role: true,
      packagingTypeId: true,
      decorationMethod: true,
      selectedVariantId: true,
      parentComponentId: true,
      displayOrder: true,
    },
  })
  return {
    ok: true,
    data: rows.map((r) => ({ ...r, fdaLocked: sealLocked && r.role === 'SEAL' })),
  }
}

export async function addPackagingComponent(
  productId: string,
  input: {
    tier: PackagingTier
    role: ComponentRole
    packagingTypeId: string
    decorationMethod?: DecorationMethod
    parentComponentId?: string | null
    unitsPerParent?: number
  },
): Promise<Result<{ id: string }>> {
  const { user, product, error } = await authorizeProduct(productId)
  if (!user || !product) return { ok: false, error: error ?? 'NOT_FOUND' }
  if (!input.packagingTypeId) return { ok: false, error: 'Missing packagingTypeId.' }

  // Append after the current max displayOrder so new slots land at the end.
  const last = await prisma.packagingComponent.findFirst({
    where: { productId },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true },
  })
  const created = await prisma.packagingComponent.create({
    data: {
      productId,
      tier: input.tier,
      role: input.role,
      packagingTypeId: input.packagingTypeId,
      decorationMethod: input.decorationMethod ?? 'NONE',
      parentComponentId: input.parentComponentId ?? null,
      unitsPerParent: input.unitsPerParent ?? 1,
      displayOrder: (last?.displayOrder ?? -1) + 1,
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'PackagingComponent',
    entityId: created.id,
    action: 'create',
    payload: { productId, tier: input.tier, role: input.role },
  })
  revalidatePath(`/products/${productId}/checkout`)
  return { ok: true, data: created }
}

export async function setComponentVariant(
  productId: string,
  componentId: string,
  variantId: string | null,
): Promise<Result<{ id: string }>> {
  const { user, product, error } = await authorizeProduct(productId)
  if (!user || !product) return { ok: false, error: error ?? 'NOT_FOUND' }

  const component = await prisma.packagingComponent.findFirst({
    where: { id: componentId, productId },
    select: { id: true, selectedVariantId: true },
  })
  if (!component) return { ok: false, error: 'Component not found on this product.' }

  // Validate the variant exists (and isn't archived) before binding it.
  if (variantId) {
    const variant = await prisma.packagingComponentVariant.findUnique({
      where: { id: variantId },
      select: { id: true, status: true },
    })
    if (!variant) return { ok: false, error: 'Variant not found.' }
    if (variant.status === 'ARCHIVED') return { ok: false, error: 'That variant is archived.' }
  }

  await prisma.packagingComponent.update({
    where: { id: componentId },
    data: { selectedVariantId: variantId },
  })
  await logAuditAs(user, {
    entityType: 'PackagingComponent',
    entityId: componentId,
    action: 'update',
    fromValue: component.selectedVariantId,
    toValue: variantId,
    payload: { field: 'selectedVariantId', productId },
  })
  revalidatePath(`/products/${productId}/checkout`)
  return { ok: true, data: { id: componentId } }
}

export async function removePackagingComponent(
  productId: string,
  componentId: string,
): Promise<Result<{ id: string }>> {
  const { user, product, error } = await authorizeProduct(productId)
  if (!user || !product) return { ok: false, error: error ?? 'NOT_FOUND' }

  const component = await prisma.packagingComponent.findFirst({
    where: { id: componentId, productId },
    select: { id: true, role: true },
  })
  if (!component) return { ok: false, error: 'Component not found on this product.' }

  // FDA guard — a mandatory tamper-evident seal can't be removed for
  // supplement/OTC products (21 CFR 211.132).
  if (
    component.role === 'SEAL' &&
    sealIsFdaMandatory(product.productTemplate?.labelingType ?? 'FOOD')
  ) {
    return {
      ok: false,
      error:
        'This tamper-evident seal is FDA-required for supplements/OTC (21 CFR 211.132) and cannot be removed.',
    }
  }

  // Re-parent any children to this component's parent before deleting, so the
  // hierarchy stays connected (children default to top-level if no parent).
  const removed = await prisma.packagingComponent.findUnique({
    where: { id: componentId },
    select: { parentComponentId: true },
  })
  await prisma.packagingComponent.updateMany({
    where: { parentComponentId: componentId },
    data: { parentComponentId: removed?.parentComponentId ?? null },
  })
  await prisma.packagingComponent.delete({ where: { id: componentId } })

  await logAuditAs(user, {
    entityType: 'PackagingComponent',
    entityId: componentId,
    action: 'delete',
    payload: { productId, role: component.role },
  })
  revalidatePath(`/products/${productId}/checkout`)
  return { ok: true, data: { id: componentId } }
}

/**
 * Default closure/seal PackagingType slug for an auto-created slot (from the
 * seeded canonical catalog). CONTAINER resolves from the chosen primary type,
 * so it returns null here.
 */
function defaultPartSlug(
  role: ComponentRole,
  category: ContainerCategory,
  labelingType: LabelingType,
): string | null {
  if (role === 'CLOSURE') {
    if (category === 'TUBE') return 'flip-top-cap'
    return labelingType === 'DIETARY_SUPPLEMENT' || labelingType === 'OTC'
      ? 'cr-cap-supplement'
      : 'metal-twist-cap-63mm'
  }
  if (role === 'SEAL') return 'induction-foil-seal'
  return null
}

/**
 * Materialize the implied component slots for a product from its chosen primary
 * container PackagingType. CONTAINER uses that type; CLOSURE/SEAL resolve to the
 * seeded default cap/seal types. Idempotent — only roles not already present are
 * created. The caller (Components UI) supplies the container type the creator picked.
 */
export async function createDefaultComponentSlots(
  productId: string,
  primaryPackagingTypeId: string,
): Promise<Result<{ created: number }>> {
  const { user, product, error } = await authorizeProduct(productId)
  if (!user || !product) return { ok: false, error: error ?? 'NOT_FOUND' }

  const primary = await prisma.packagingType.findUnique({
    where: { id: primaryPackagingTypeId },
    select: { id: true, containerCategory: true },
  })
  if (!primary) return { ok: false, error: 'Packaging type not found.' }
  if (!primary.containerCategory) {
    return { ok: false, error: 'That packaging type has no container category set.' }
  }

  const labelingType = product.productTemplate?.labelingType ?? 'FOOD'
  const slots = impliedComponentSlots(primary.containerCategory, labelingType)

  const existing = await prisma.packagingComponent.findMany({
    where: { productId },
    select: { role: true, displayOrder: true },
  })
  const presentRoles = new Set(existing.map((e) => e.role))
  let order = existing.reduce((m, e) => Math.max(m, e.displayOrder), -1)

  // Resolve default cap/seal type ids by slug in one query.
  const slugs = slots
    .map((s) => defaultPartSlug(s.role, primary.containerCategory!, labelingType))
    .filter((s): s is string => !!s)
  const parts = slugs.length
    ? await prisma.packagingType.findMany({
        where: { slug: { in: slugs } },
        select: { id: true, slug: true },
      })
    : []
  const idBySlug = new Map(parts.map((p) => [p.slug, p.id]))

  const toCreate = slots
    .filter((s) => !presentRoles.has(s.role))
    .map((s) => {
      const slug = defaultPartSlug(s.role, primary.containerCategory!, labelingType)
      const packagingTypeId = s.role === 'CONTAINER' ? primary.id : slug ? idBySlug.get(slug) : null
      return packagingTypeId
        ? {
            productId,
            tier: s.tier,
            role: s.role,
            packagingTypeId,
            decorationMethod: 'NONE' as DecorationMethod,
            displayOrder: ++order,
          }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (toCreate.length === 0) return { ok: true, data: { created: 0 } }

  await prisma.packagingComponent.createMany({ data: toCreate })
  await logAuditAs(user, {
    entityType: 'PackagingComponent',
    entityId: productId,
    action: 'create',
    payload: {
      productId,
      seeded: true,
      roles: toCreate.map((c) => c.role),
      primaryPackagingTypeId,
    },
  })
  revalidatePath(`/products/${productId}/checkout`)
  return { ok: true, data: { created: toCreate.length } }
}
