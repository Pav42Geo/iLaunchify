'use server'

// Admin Packaging Studio — surface authoring save (ADMIN_PACKAGING_STUDIO.md P2).
// Persists the typed surfaces back to PackagingType.defaultSurfaces (JSON-first, no
// migration). catalog:write-gated + audited. The three.js hotspot canvas (draw the
// clickable border) is the next slice; this save already carries the hotspot shape.

import { prisma } from '@ilaunchify/db'
import { requireCapability } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { serializePackagingSurfaces, resolvePackagingSurfaces, type PackagingSurface } from '@ilaunchify/ui'

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function savePackagingSurfaces(packagingTypeId: string, surfaces: PackagingSurface[]): Promise<SaveResult> {
  const admin = await requireCapability('catalog:write')
  // Normalize through the resolver so a malformed client payload can't corrupt the JSON.
  const clean = serializePackagingSurfaces(resolvePackagingSurfaces(serializePackagingSurfaces(surfaces)))
  const done = await (
    prisma as unknown as { packagingType: { update: (a: unknown) => Promise<unknown> } }
  ).packagingType
    .update({ where: { id: packagingTypeId }, data: { defaultSurfaces: clean } })
    .catch(() => null)
  if (done === null) return { ok: false, error: 'Could not save surfaces (is the schema pushed?).' }
  await logAuditAs(admin, {
    entityType: 'PackagingType',
    entityId: packagingTypeId,
    action: 'packaging-surfaces.saved',
    payload: { count: surfaces.length },
  })
  return { ok: true }
}
