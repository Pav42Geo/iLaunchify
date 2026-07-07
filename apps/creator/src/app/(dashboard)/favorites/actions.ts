'use server'

// Favorites — private per-creator save list (docs/FAVORITES_MANAGEMENT.md, P0).
//
// A favorite is a join row owned by the creator's CreatorProfile, so it is
// private by construction. Two nullable FKs + a `kind` discriminator; exactly
// one target column is set per kind. Every toggle writes an AuditLog row.
//
// No FSM — a favorite is a simple toggle, not a lifecycle entity.

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export type FavoritableKind = 'PRODUCT_TEMPLATE' | 'PRODUCT'

export type ToggleFavoriteResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string }

/**
 * Resolve the current creator's CreatorProfile id, or null if the caller
 * isn't a creator (admin impersonation etc. can't own favorites).
 */
async function currentCreatorId(): Promise<{ userId: string; creatorId: string } | null> {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return null
  const profile = await prisma.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!profile) return null
  return { userId: user.id, creatorId: profile.id }
}

/**
 * Toggle a favorite on/off for the current creator. Idempotent — returns the
 * resulting saved state. The unique indexes (creatorId,productTemplateId) /
 * (creatorId,productId) back "one favorite per target."
 */
export async function toggleFavorite(input: {
  kind: FavoritableKind
  targetId: string
}): Promise<ToggleFavoriteResult> {
  const ctx = await currentCreatorId()
  if (!ctx) return { ok: false, error: 'Sign in as a creator to save favorites.' }
  const { userId, creatorId } = ctx
  const { kind, targetId } = input
  if (!targetId) return { ok: false, error: 'Missing target.' }

  // Look up any existing row for this (creator, target) via the matching
  // compound unique key.
  const existing =
    kind === 'PRODUCT_TEMPLATE'
      ? await prisma.favorite.findUnique({
          where: { creatorId_productTemplateId: { creatorId, productTemplateId: targetId } },
          select: { id: true },
        })
      : await prisma.favorite.findUnique({
          where: { creatorId_productId: { creatorId, productId: targetId } },
          select: { id: true },
        })

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } })
    await logAuditAs(
      { id: userId, role: 'CREATOR' },
      { entityType: 'Favorite', entityId: existing.id, action: 'FAVORITE_REMOVED', payload: { kind, targetId } },
    )
    revalidatePath('/favorites')
    return { ok: true, saved: false }
  }

  const created = await prisma.favorite.create({
    data: {
      creatorId,
      kind,
      productTemplateId: kind === 'PRODUCT_TEMPLATE' ? targetId : null,
      productId: kind === 'PRODUCT' ? targetId : null,
    },
    select: { id: true },
  })
  await logAuditAs(
    { id: userId, role: 'CREATOR' },
    { entityType: 'Favorite', entityId: created.id, action: 'FAVORITE_ADDED', payload: { kind, targetId } },
  )
  revalidatePath('/favorites')
  return { ok: true, saved: true }
}

/** The current creator's favorited own-Product ids (for rendering Save state on cards). */
export async function getFavoritedProductIds(): Promise<Set<string>> {
  const ctx = await currentCreatorId()
  if (!ctx) return new Set()
  const rows = await prisma.favorite.findMany({
    where: { creatorId: ctx.creatorId, kind: 'PRODUCT', productId: { not: null } },
    select: { productId: true },
  })
  return new Set(rows.map((r) => r.productId as string))
}

/** Count for the header badge. */
export async function getFavoritesCount(creatorProfileId: string): Promise<number> {
  return prisma.favorite.count({ where: { creatorId: creatorProfileId } })
}
