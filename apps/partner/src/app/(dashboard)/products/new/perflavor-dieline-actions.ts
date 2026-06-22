'use server'

// Per-flavor labels Phase 3 — assign a die-line per FlavorPreset (default: the
// shared template die-line). Lives in step 4 (Packaging Studio) where die-lines
// are managed. docs/HANDOFF-TO-CODE-per-flavor-labels.md §3.
//
// NOTE (tracked follow-up): saveFlavors deletes + recreates FlavorPreset rows,
// so FlavorPreset.dielineId set here is wiped if the partner re-edits flavors.
// Preserving it across that rebuild (match by name/sortOrder in build-actions)
// is a separate, deliberate change — see the Phase 3 handoff.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'

export interface FlavorDielineRow { id: string; name: string; swatchHex: string | null; dielineId: string | null }
export interface DielineOption { id: string; label: string }
export type PerFlavorDielineData =
  | { ok: true; flavors: FlavorDielineRow[]; dielines: DielineOption[] }
  | { ok: false; error: string }

async function partnerCtx() {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { user, serviceIds: [] as string[], error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { services: { select: { id: true } } },
  })
  return { user, serviceIds: (partner?.services ?? []).map((s) => s.id), error: partner ? null : 'Partner profile not found.' }
}

/** Load the draft's flavors (+ current die-line) and the die-lines available for
 *  its packaging types. Returns {ok:false} when not a per-flavor draft / no access. */
export async function loadPerFlavorDielines(draftId: string): Promise<PerFlavorDielineData> {
  try {
    const { serviceIds, error } = await partnerCtx()
    if (error) return { ok: false, error }
    const tpl = await prisma.productTemplate.findUnique({
      where: { id: draftId },
      select: {
        manufacturerServiceId: true,
        flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, swatchHex: true, dielineId: true } },
        packagingSystems: { select: { packagingSystem: { select: { packagingTypeId: true } } } },
      },
    })
    if (!tpl) return { ok: false, error: 'Draft not found' }
    if (tpl.manufacturerServiceId && !serviceIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Access denied' }
    }

    const typeIds = [
      ...new Set(
        tpl.packagingSystems.map((ps) => ps.packagingSystem?.packagingTypeId).filter((x): x is string => !!x),
      ),
    ]
    const dielineRows = typeIds.length
      ? await prisma.packagingDieline.findMany({
          where: { packagingTypeId: { in: typeIds } },
          select: { id: true, decorationMethod: true, packagingType: { select: { displayName: true } } },
          orderBy: { updatedAt: 'asc' },
        })
      : []

    return {
      ok: true,
      flavors: tpl.flavorPresets.map((f) => ({ id: f.id, name: f.name, swatchHex: f.swatchHex, dielineId: f.dielineId })),
      dielines: dielineRows.map((d) => ({
        id: d.id,
        label: `${d.packagingType?.displayName ?? 'Die-line'}${d.decorationMethod ? ` · ${d.decorationMethod}` : ''}`,
      })),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Load failed' }
  }
}

/** Set (or clear, null = shared) a flavor's die-line override. */
export async function setFlavorDieline(
  draftId: string,
  flavorPresetId: string,
  dielineId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { user, serviceIds, error } = await partnerCtx()
    if (error) return { ok: false, error }
    const tpl = await prisma.productTemplate.findUnique({ where: { id: draftId }, select: { manufacturerServiceId: true } })
    if (!tpl) return { ok: false, error: 'Draft not found' }
    if (tpl.manufacturerServiceId && !serviceIds.includes(tpl.manufacturerServiceId)) {
      return { ok: false, error: 'Access denied' }
    }
    // The flavor must belong to this draft (ownership already checked above).
    const fp = await prisma.flavorPreset.findFirst({
      where: { id: flavorPresetId, productTemplateId: draftId },
      select: { id: true },
    })
    if (!fp) return { ok: false, error: 'Flavor not found on this product.' }

    await prisma.flavorPreset.update({ where: { id: flavorPresetId }, data: { dielineId } })
    await logAuditAs(user, {
      entityType: 'ProductTemplate',
      entityId: draftId,
      action: 'PRODUCT_TEMPLATE_UPDATE',
      payload: { perFlavorDieline: { flavorPresetId, dielineId } },
    }).catch(() => {})
    revalidatePath('/products/new')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' }
  }
}
