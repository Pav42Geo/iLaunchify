'use server'

// #135 — assign a default die-line (DieCutTemplate) to a physical PackagingType
// (container). The Design Studio uses it as the fallback when a product's variant
// has no die-line of its own. Cast-guarded: PackagingType.defaultDieCutTemplateId
// lands with the #135 migration (run `pnpm db:push` + `db:generate`).

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export async function setContainerDieCut(
  packagingTypeId: string,
  dieCutTemplateId: string | null,
): Promise<Result> {
  try {
    const user = await requireUser()
    if (user.role !== 'ADMIN') return { ok: false, error: 'Admin only.' }
    await (prisma as unknown as {
      packagingType: { update: (a: unknown) => Promise<unknown> }
    }).packagingType.update({
      where: { id: packagingTypeId },
      data: { defaultDieCutTemplateId: dieCutTemplateId },
    })
    revalidatePath('/asset-management/packaging-containers')
    return { ok: true }
  } catch (err) {
    console.error('[setContainerDieCut] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}

/** Product domains (LabelingType keys) a packaging type applies to. Empty = all.
 *  Scopes the marketplace packaging filter + the partner picker. Cast-guarded —
 *  applicableLabelingTypes lands with the 2026-06-30 migration. */
export async function setContainerDomains(
  packagingTypeId: string,
  domains: string[],
): Promise<Result> {
  try {
    const user = await requireUser()
    if (user.role !== 'ADMIN') return { ok: false, error: 'Admin only.' }
    const allowed = new Set(['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'OTC', 'COSMETIC'])
    const clean = [...new Set(domains)].filter((d) => allowed.has(d))
    await (prisma as unknown as {
      packagingType: { update: (a: unknown) => Promise<unknown> }
    }).packagingType.update({
      where: { id: packagingTypeId },
      data: { applicableLabelingTypes: clean },
    })
    revalidatePath('/asset-management/packaging-containers')
    return { ok: true }
  } catch (err) {
    console.error('[setContainerDomains] failed:', err)
    return { ok: false, error: `Could not save: ${(err as Error).message}` }
  }
}
