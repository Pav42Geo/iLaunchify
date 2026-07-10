// CLOSED_WON materialization — CO_CREATION_MARKETPLACE_SPEC §6 + §17 tail.
// The approved RECIPE BuildObject payload materializes into the EXISTING
// Product + Recipe + RecipeIngredient models ("reuse, don't duplicate" — the
// BuildObjectVersion payload stays the immutable in-room source of truth).
//
// Deliberate P0 scope (recon 2026-07-10):
//   • Product is created TEMPLATE-LESS (schema-legal; findRouting falls back
//     to category-match scoring when productTemplateId is null). First
//     template-less product in production code — flagged in the audit payload.
//   • NO Order row is created here. A real Order requires ship-to + totals
//     the room doesn't have; fabricating a PENDING_PAYMENT row would put
//     garbage in money-path tables (operational-trust rule). Ordering runs
//     through the normal checkout, where the creator tier fee + manufacturer
//     merit withhold already apply. (§17 wording says "Order draft" — this is
//     the one documented deviation.)
//   • Free-text amounts parse best-effort to grams; unparseable amounts
//     store weightG=0 and the Recipe stays DRAFT with placeholder serving
//     fields — the creator finishes real quantities in the product editor.
//   • Unknown ingredients are created PARTNER_PRIVATE + SELF_ATTESTED owned
//     by the room's maker (ingredient-governance model), after the
//     banned-ingredient gate.

import { prisma, findFirstBannedIngredient, type Prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { assertRoomTransition } from './room-object-fsm'
import { assertBriefTransition } from './brief-fsm'
import type { RoomActor } from './room-service'

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no prisma)
// ---------------------------------------------------------------------------

export interface RecipeRowInput {
  name: string
  amount: string
  note: string
}

/**
 * Best-effort parse of a free-text amount into grams.
 * Handles "9g", "9 g", "0.5kg", "250mg", "9g/serv" (per-serving reads as the
 * gram figure). Percentages, "trace", counts, and anything else → null.
 */
export function parseAmountToGrams(amount: string): number | null {
  const m = amount
    .trim()
    .toLowerCase()
    .match(/^([0-9]+(?:[.,][0-9]+)?)\s*(mg|g|kg)(?:\s*\/\s*[a-z]+)?$/)
  if (!m || !m[1] || !m[2]) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  const factor = m[2] === 'kg' ? 1000 : m[2] === 'mg' ? 0.001 : 1
  return Math.round(n * factor * 1000) / 1000
}

/** Normalize + dedupe payload rows (last occurrence of a name wins). */
export function normalizeRecipeRows(payload: unknown): RecipeRowInput[] {
  if (!payload || typeof payload !== 'object') return []
  const raw = (payload as { rows?: unknown }).rows
  if (!Array.isArray(raw)) return []
  const byName = new Map<string, RecipeRowInput>()
  for (const r of raw as Partial<RecipeRowInput>[]) {
    const name = String(r?.name ?? '').trim()
    if (!name) continue
    byName.set(name.toLowerCase(), {
      name,
      amount: String(r?.amount ?? '').trim(),
      note: String(r?.note ?? '').trim(),
    })
  }
  return [...byName.values()]
}

export function slugifyTitle(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'co-created-product'
  )
}

// ---------------------------------------------------------------------------
// The transaction
// ---------------------------------------------------------------------------

export type MaterializeResult =
  | { ok: true; productId: string }
  | { ok: false; error: string }

/**
 * Close a room as WON and materialize the approved recipe into a draft
 * Product + Recipe. CALLER OWNS THE GUARDS: verify the actor is the brief's
 * owning creator before calling (same contract as room-service).
 */
export async function materializeRoomWon(
  actor: RoomActor,
  roomId: string,
): Promise<MaterializeResult> {
  const room = await prisma.coCreationRoom.findUnique({
    where: { id: roomId },
    include: {
      brief: { include: { creator: { select: { id: true } } } },
      objects: {
        where: { kind: 'RECIPE' },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      },
    },
  })
  if (!room) return { ok: false, error: 'Room not found' }
  if (room.materializedProductId) return { ok: false, error: 'This room already produced a product' }

  const recipeObject = room.objects[0]
  if (!recipeObject || (recipeObject.status !== 'APPROVED' && recipeObject.status !== 'LOCKED')) {
    return { ok: false, error: 'Approve the recipe before closing the room' }
  }
  const latestVersion = recipeObject.versions[0]
  if (!latestVersion) return { ok: false, error: 'The recipe has no submitted version' }

  const rows = normalizeRecipeRows(latestVersion.payload)
  if (rows.length === 0) return { ok: false, error: 'The approved recipe has no ingredient rows' }

  // FSM edges asserted up front.
  assertRoomTransition(room.status, 'CLOSED_WON')
  assertBriefTransition(room.brief.status, 'IN_PRODUCTION')

  // Banned-ingredient gate (FDA_REGULATORY_POSTURE §5) BEFORE any writes.
  const banned = await findFirstBannedIngredient(rows.map((r) => r.name))
  if (banned) {
    await logAuditAs(actor, {
      entityType: 'CoCreationRoom',
      entityId: room.id,
      action: 'INGREDIENT_BANNED_BLOCK',
      payload: { briefId: room.briefId, ingredient: banned.name, match: banned.match },
    })
    return {
      ok: false,
      error: `“${banned.name}” can't be used on iLaunchify — remove it from the recipe first`,
    }
  }

  // Resolve or create Ingredient rows. Visible = global catalog rows or the
  // maker's own private rows; misses become PARTNER_PRIVATE + SELF_ATTESTED
  // owned by the maker (they authored the formula).
  const ingredientIds: { ingredientId: string; row: RecipeRowInput }[] = []
  for (const row of rows) {
    const existing = await prisma.ingredient.findFirst({
      where: {
        name: { equals: row.name, mode: 'insensitive' },
        OR: [{ ownerPartnerId: null }, { ownerPartnerId: room.partnerId }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (existing) {
      ingredientIds.push({ ingredientId: existing.id, row })
    } else {
      const created = await prisma.ingredient.create({
        data: {
          name: row.name,
          nutritionPer100g: {},
          source: 'PARTNER_PRIVATE',
          verificationStatus: 'SELF_ATTESTED',
          ownerPartnerId: room.partnerId,
        },
        select: { id: true },
      })
      ingredientIds.push({ ingredientId: created.id, row })
    }
  }

  const market = await prisma.market.findUnique({ where: { code: 'US' } })
  if (!market) return { ok: false, error: 'US market missing — run seed' }

  // Brand: the creator's default (created if none — Brand-optional flow).
  const { getOrCreateDefaultBrand } = await import('@ilaunchify/db')
  const { brandId } = await getOrCreateDefaultBrand(room.brief.creator.id)

  // Unique slug within the brand.
  let slug = slugifyTitle(room.brief.title)
  const clash = await prisma.product.findFirst({ where: { brandId, slug }, select: { id: true } })
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        brandId,
        marketId: market.id,
        slug,
        name: room.brief.title,
        description: `Co-created with your manufacturing partner via an iLaunchify collaboration room.`,
        category: room.brief.category,
        status: 'DRAFT',
        // TEMPLATE-LESS by design (see module header) — routing falls back
        // to category scoring; the maker relationship lives on the room.
        recipe: {
          create: {
            status: 'DRAFT',
            // Placeholder serving fields (required columns): the creator
            // finishes real serving data in the product editor before any
            // label/nutrition math runs.
            servingsPerContainer: 1,
            servingSizeG: 100,
          },
        },
      },
      include: { recipe: { select: { id: true } } },
    })

    await tx.recipeIngredient.createMany({
      data: ingredientIds.map(({ ingredientId, row }, idx) => ({
        recipeId: created.recipe!.id,
        ingredientId,
        weightG: parseAmountToGrams(row.amount) ?? 0,
        position: idx,
      })),
    })

    await tx.coCreationRoom.update({
      where: { id: room.id },
      data: { status: 'CLOSED_WON', materializedProductId: created.id },
    })
    await tx.productBrief.update({
      where: { id: room.briefId },
      data: { status: 'IN_PRODUCTION' },
    })
    await tx.roomEvent.create({
      data: {
        roomId: room.id,
        kind: 'ROOM_CLOSED_WON',
        data: {
          productId: created.id,
          recipeVersion: latestVersion.version,
          rows: rows as unknown as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
    })

    return created
  })

  await logAuditAs(actor, {
    entityType: 'CoCreationRoom',
    entityId: room.id,
    action: 'ROOM_STATUS_CHANGED',
    fromValue: 'ACTIVE',
    toValue: 'CLOSED_WON',
    payload: { briefId: room.briefId, productId: product.id },
  })
  await logAuditAs(actor, {
    entityType: 'ProductBrief',
    entityId: room.briefId,
    action: 'BRIEF_STATUS_CHANGED',
    fromValue: room.brief.status,
    toValue: 'IN_PRODUCTION',
    payload: { roomId: room.id, productId: product.id },
  })
  await logAuditAs(actor, {
    entityType: 'Product',
    entityId: product.id,
    action: 'COCREATION_PRODUCT_MATERIALIZED',
    payload: {
      roomId: room.id,
      briefId: room.briefId,
      recipeVersion: latestVersion.version,
      templateLess: true, // first template-less product pattern — see header
      ingredientCount: ingredientIds.length,
      unparsedAmounts: rows.filter((r) => parseAmountToGrams(r.amount) === null).length,
    },
  })

  return { ok: true, productId: product.id }
}
