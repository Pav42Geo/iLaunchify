'use server'

// Studio versioning v2 — Alternates server actions (docs/DESIGN_STUDIO_VERSIONING.md
// §3.2/§4.3). Sibling design candidates for one slot (productId, surfaceKey,
// flavorPresetId); exactly one sibling is Active (app-logic enforced, like
// showsCertifications). Promote = confirm + PROMOTION snapshot on the OUTGOING
// Active + AuditLog. Delete = refused while any DesignVersion is order-locked.
//
// Ownership: every action owner-scopes through the product→brand→creatorProfile
// chain (requireUser + where-clause — the canvas-actions convention; no ad-hoc
// checks). Every mutation writes AuditLog.
//
// Cast-guarded: the alternate columns (isActiveAlternate / alternateName /
// alternateSort / forkedFromId / surfaceKey) and SnapshotKind.PROMOTION post-date
// the generated client until `pnpm db:push` + `db:generate` — drop the casts in
// the post-push cleanup pass. Pre-push these actions fail gracefully (the UI that
// calls them is Phase 3, which mounts after the push).

import { revalidatePath } from 'next/cache'
import { prisma, createSnapshot, getSnapshotJson } from '@ilaunchify/db'
import type { SnapshotKind } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
import { designAlternateCap } from '@ilaunchify/plans'
import { logAuditAs } from '@ilaunchify/audit'

const WORKING_VERSION = 1

type Result = { ok: true; designId?: string } | { ok: false; error: string }

/**
 * Phase 5 server-side cap (§4.4, count-gating only): siblings in the source's
 * slot vs the creator's tier cap. Returns an error string when at cap, else null.
 * The strip nudges client-side too, but the server is the authority.
 */
async function alternateCapError(
  userId: string,
  slot: { productId: string; flavorPresetId: string | null; surfaceKey: string | null },
): Promise<string | null> {
  const cap = designAlternateCap(await getCreatorTier(userId))
  if (cap === null) return null
  const siblings = await designDelegate()
    .design.findMany({
      where: { productId: slot.productId, flavorPresetId: slot.flavorPresetId, surfaceKey: slot.surfaceKey },
      select: { id: true },
    })
    .catch(() => [])
  if (siblings.length >= cap) {
    return `Alternate limit reached (${cap} per label on your plan) — upgrade in Settings → Plan for more.`
  }
  return null
}

export interface AlternateRow {
  id: string
  isActiveAlternate: boolean
  alternateName: string | null
  alternateSort: number
  forkedFromId: string | null
  updatedAt: string
}

// Cast-guarded delegate — the alternate columns post-date the generated client.
const designDelegate = () =>
  prisma as unknown as {
    design: {
      findFirst: (a: unknown) => Promise<Record<string, unknown> | null>
      findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>
      create: (a: unknown) => Promise<{ id: string }>
      update: (a: unknown) => Promise<unknown>
      updateMany: (a: unknown) => Promise<unknown>
      delete: (a: unknown) => Promise<unknown>
    }
  }

/** Owner-scoped design fetch (slot fields included, cast-guarded). */
async function ownedAlternate(designId: string, userId: string) {
  return designDelegate().design.findFirst({
    where: { id: designId, product: { brand: { creatorProfile: { userId } } } },
    select: {
      id: true,
      productId: true,
      brandId: true,
      flavorPresetId: true,
      surfaceKey: true,
      isActiveAlternate: true,
      alternateName: true,
      versions: { where: { version: WORKING_VERSION }, select: { designJson: true }, take: 1 },
    },
  }) as Promise<{
    id: string
    productId: string
    brandId: string
    flavorPresetId: string | null
    surfaceKey: string | null
    isActiveAlternate: boolean
    alternateName: string | null
    versions: Array<{ designJson: unknown }>
  } | null>
}

/** List the slot's alternates (Active first, then sort order). */
export async function listAlternates(
  productId: string,
  scope: { flavorPresetId?: string | null; surfaceKey?: string | null },
): Promise<AlternateRow[]> {
  const user = await requireUser()
  const rows = (await designDelegate()
    .design.findMany({
      where: {
        productId,
        flavorPresetId: scope.flavorPresetId ?? null,
        surfaceKey: scope.surfaceKey ?? null,
        product: { brand: { creatorProfile: { userId: user.id } } },
      },
      orderBy: [{ isActiveAlternate: 'desc' }, { alternateSort: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        isActiveAlternate: true,
        alternateName: true,
        alternateSort: true,
        forkedFromId: true,
        updatedAt: true,
      },
    })
    .catch(() => [])) as Array<{
    id: string
    isActiveAlternate: boolean
    alternateName: string | null
    alternateSort: number
    forkedFromId: string | null
    updatedAt: Date
  }>
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))
}

/**
 * Create a new alternate in the source design's slot. mode 'duplicate' copies the
 * source's working JSON; 'blank' starts empty. New alternates are drafts
 * (isActiveAlternate false) — never steal Active or the cert-host flag. Tier caps
 * (Maker 2 / Builder 5 / Agency ∞) land with Phase 5 in packages/plans.
 */
export async function createAlternate(
  sourceDesignId: string,
  mode: 'duplicate' | 'blank',
  name?: string,
): Promise<Result> {
  try {
    const user = await requireUser()
    const src = await ownedAlternate(sourceDesignId, user.id)
    if (!src) return { ok: false, error: 'Design not found or access denied' }
    const capError = await alternateCapError(user.id, src)
    if (capError) return { ok: false, error: capError }

    const created = await designDelegate().design.create({
      data: {
        productId: src.productId,
        brandId: src.brandId,
        status: 'DRAFT',
        flavorPresetId: src.flavorPresetId,
        surfaceKey: src.surfaceKey,
        isActiveAlternate: false,
        alternateName: name?.trim() || null,
        forkedFromId: mode === 'duplicate' ? src.id : null,
      },
      select: { id: true },
    })

    const srcJson = src.versions[0]?.designJson
    if (mode === 'duplicate' && srcJson != null) {
      await prisma.designVersion.create({
        data: { designId: created.id, version: WORKING_VERSION, designJson: srcJson as never, source: 'USER_UPLOAD' },
      })
    }

    await logAuditAs(user, {
      entityType: 'Design',
      entityId: created.id,
      action: 'DESIGN_ALTERNATE_CREATED',
      payload: { productId: src.productId, mode, forkedFromId: mode === 'duplicate' ? src.id : null, name: name?.trim() || null },
    })
    revalidatePath(`/products/${src.productId}/design/canvas`)
    return { ok: true, designId: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create alternate' }
  }
}

/**
 * Fork a HISTORY SNAPSHOT into a new draft alternate in the source design's slot
 * (§4.2 "Open as new alternate"). Same guarantees as createAlternate: the new
 * sibling is a draft, never steals Active. Snapshot must belong to the source
 * design (entity-scoped fetch).
 */
export async function createAlternateFromSnapshot(
  sourceDesignId: string,
  snapshotId: string,
  name?: string,
): Promise<Result> {
  try {
    const user = await requireUser()
    const src = await ownedAlternate(sourceDesignId, user.id)
    if (!src) return { ok: false, error: 'Design not found or access denied' }
    const capError = await alternateCapError(user.id, src)
    if (capError) return { ok: false, error: capError }
    const json = await getSnapshotJson(snapshotId, 'DESIGN', src.id)
    if (json == null) return { ok: false, error: 'Version not found' }

    const created = await designDelegate().design.create({
      data: {
        productId: src.productId,
        brandId: src.brandId,
        status: 'DRAFT',
        flavorPresetId: src.flavorPresetId,
        surfaceKey: src.surfaceKey,
        isActiveAlternate: false,
        alternateName: name?.trim() || null,
        forkedFromId: src.id,
      },
      select: { id: true },
    })
    await prisma.designVersion.create({
      data: { designId: created.id, version: WORKING_VERSION, designJson: json as never, source: 'USER_UPLOAD' },
    })

    await logAuditAs(user, {
      entityType: 'Design',
      entityId: created.id,
      action: 'DESIGN_ALTERNATE_CREATED',
      payload: { productId: src.productId, mode: 'from-snapshot', snapshotId, forkedFromId: src.id, name: name?.trim() || null },
    })
    revalidatePath(`/products/${src.productId}/design/canvas`)
    return { ok: true, designId: created.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create alternate' }
  }
}

/** Rename an alternate (label only — no other semantics). */
export async function renameAlternate(designId: string, name: string): Promise<Result> {
  try {
    const user = await requireUser()
    const d = await ownedAlternate(designId, user.id)
    if (!d) return { ok: false, error: 'Design not found or access denied' }
    await designDelegate().design.update({ where: { id: d.id }, data: { alternateName: name.trim() || null } })
    await logAuditAs(user, {
      entityType: 'Design',
      entityId: d.id,
      action: 'DESIGN_ALTERNATE_RENAMED',
      fromValue: d.alternateName ?? undefined,
      toValue: name.trim(),
      payload: { productId: d.productId },
    })
    return { ok: true, designId: d.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not rename alternate' }
  }
}

/**
 * Promote an alternate to Active for its slot (§4.3, decision locked: confirm +
 * snapshot). The OUTGOING Active gets a pinned PROMOTION snapshot; siblings are
 * demoted in the same transaction; in-flight orders keep their locked
 * DesignVersions regardless.
 */
export async function promoteAlternate(designId: string): Promise<Result> {
  try {
    const user = await requireUser()
    const target = await ownedAlternate(designId, user.id)
    if (!target) return { ok: false, error: 'Design not found or access denied' }
    if (target.isActiveAlternate) return { ok: true, designId: target.id } // already Active

    // The outgoing Active in the same slot (may be absent for orphaned slots).
    const outgoing = (await designDelegate().design.findFirst({
      where: {
        productId: target.productId,
        flavorPresetId: target.flavorPresetId,
        surfaceKey: target.surfaceKey,
        isActiveAlternate: true,
      },
      select: {
        id: true,
        alternateName: true,
        versions: { where: { version: WORKING_VERSION }, select: { designJson: true }, take: 1 },
      },
    })) as { id: string; alternateName: string | null; versions: Array<{ designJson: unknown }> } | null

    // Pin the outgoing state FIRST (PROMOTION kind — exempt from pruning) so the
    // handover is always reversible from history.
    if (outgoing && outgoing.versions[0]?.designJson != null) {
      await createSnapshot({
        entityType: 'DESIGN',
        entityId: outgoing.id,
        snapshot: outgoing.versions[0].designJson,
        // 'PROMOTION' joins the SnapshotKind union with Cowork's uncommitted Phase-1
        // engine changes; double-cast so this compiles against the pre-Phase-1 union too.
        kind: 'PROMOTION' as unknown as SnapshotKind,
        label: `Replaced by "${target.alternateName ?? 'alternate'}" — ${new Date().toLocaleDateString()}`,
        createdById: user.id,
      })
    }

    await prisma.$transaction([
      designDelegate().design.updateMany({
        where: {
          productId: target.productId,
          flavorPresetId: target.flavorPresetId,
          surfaceKey: target.surfaceKey,
          isActiveAlternate: true,
        },
        data: { isActiveAlternate: false },
      }) as never,
      designDelegate().design.update({
        where: { id: target.id },
        data: { isActiveAlternate: true },
      }) as never,
    ])

    await logAuditAs(user, {
      entityType: 'Design',
      entityId: target.id,
      action: 'DESIGN_ALTERNATE_PROMOTED',
      payload: { productId: target.productId, outgoingDesignId: outgoing?.id ?? null, name: target.alternateName },
    })
    revalidatePath(`/products/${target.productId}/design/canvas`)
    return { ok: true, designId: target.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not promote alternate' }
  }
}

/**
 * Delete a draft alternate. Refused when it is the Active (promote another first)
 * or when any of its DesignVersions are order-locked (Phase G8 rule — rows
 * referenced by orderItems are never deletable). Snapshots orphan harmlessly.
 */
export async function deleteAlternate(designId: string): Promise<Result> {
  try {
    const user = await requireUser()
    const d = await ownedAlternate(designId, user.id)
    if (!d) return { ok: false, error: 'Design not found or access denied' }
    if (d.isActiveAlternate) {
      return { ok: false, error: 'This is the Active design — make another design Active first.' }
    }
    const locked = await prisma.designVersion.count({
      where: { designId: d.id, orderItems: { some: {} } },
    })
    if (locked > 0) {
      return { ok: false, error: 'This design has versions locked to placed orders and can’t be deleted.' }
    }
    await prisma.designVersion.deleteMany({ where: { designId: d.id } })
    await designDelegate().design.delete({ where: { id: d.id } })
    await logAuditAs(user, {
      entityType: 'Design',
      entityId: d.id,
      action: 'DESIGN_ALTERNATE_DELETED',
      payload: { productId: d.productId, name: d.alternateName },
    })
    revalidatePath(`/products/${d.productId}/design/canvas`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete alternate' }
  }
}
