// Integration rotation metadata (docs/INTEGRATIONS.md). Records WHEN a key was
// last rotated + an optional cadence override — NEVER any secret value. Keyed by
// the integration `key` from the code-side registry.
//
// Cast-guarded: the IntegrationMeta model lands on the generated client only after
// the Mac db push; a missing model falls back to empty (no rotation history).

import { prisma } from './index'

export interface IntegrationMetaRow {
  key: string
  lastRotatedAt: Date | null
  rotateEveryDays: number | null
  notes: string | null
}

function model() {
  // ADMIN-RBAC-CAST: drop once the generated client knows IntegrationMeta.
  return prisma as unknown as {
    integrationMeta: {
      findMany: (a?: unknown) => Promise<IntegrationMetaRow[]>
      upsert: (a: unknown) => Promise<unknown>
    }
  }
}

/** All rotation metadata as { key: row }. Empty if the model isn't migrated yet. */
export async function getIntegrationMetaMap(): Promise<Record<string, IntegrationMetaRow>> {
  try {
    const rows = await model()
      .integrationMeta.findMany({ select: { key: true, lastRotatedAt: true, rotateEveryDays: true, notes: true } })
      .catch(() => [] as IntegrationMetaRow[])
    const out: Record<string, IntegrationMetaRow> = {}
    for (const r of rows) out[r.key] = r
    return out
  } catch {
    return {}
  }
}

/** Stamp lastRotatedAt = now for an integration key (upsert). */
export async function markIntegrationRotated(key: string): Promise<void> {
  const now = new Date()
  await model().integrationMeta.upsert({
    where: { key },
    update: { lastRotatedAt: now },
    create: { key, lastRotatedAt: now },
  })
}

/** Set the cadence override (days). null clears it → fall back to the registry default. */
export async function setIntegrationCadence(key: string, rotateEveryDays: number | null): Promise<void> {
  await model().integrationMeta.upsert({
    where: { key },
    update: { rotateEveryDays },
    create: { key, rotateEveryDays },
  })
}
