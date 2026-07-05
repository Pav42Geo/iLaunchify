// Reusable creative-vocabulary groups (AI_PACKAGING_GENERATOR §14, Phase 2).
//
// Table-backed successor to the JSON `vocabGroupsJson` / `domainGroupsJson` blobs.
// A group is a named bundle of style / colour / element terms (AiVocabGroup); a
// domain "uses" zero or more groups via the AiDomainVocabGroup join. A domain's
// effective creative vocabulary = its own preset/override UNION every assigned
// group (folded by @ilaunchify/ai-design#resolveDomainVocabulary at the call site).
//
// Every access is cast-guarded (`prisma as unknown as …`) so this compiles + runs
// against the pre-migration Prisma client and degrades to empty until the additive
// schema is pushed (pnpm db:push → db:generate) — same contract as the rest of the
// AI generator settings layer.

import { prisma } from './index'

export interface AiVocabGroupRow {
  id: string
  label: string
  styles: string[]
  colors: string[]
  elements: string[]
  sortOrder: number
  active: boolean
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

type GroupClient = {
  aiVocabGroup: {
    findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>
    create: (a: unknown) => Promise<{ id: string }>
    update: (a: unknown) => Promise<{ id: string }>
    delete: (a: unknown) => Promise<unknown>
  }
}
type LinkClient = {
  aiDomainVocabGroup: {
    findMany: (a: unknown) => Promise<Array<{ domain: string; groupId: string }>>
    deleteMany: (a: unknown) => Promise<unknown>
    create: (a: unknown) => Promise<unknown>
  }
}

function groupClient() {
  return (prisma as unknown as GroupClient).aiVocabGroup
}
function linkClient() {
  return (prisma as unknown as LinkClient).aiDomainVocabGroup
}

/** All groups, ordered for admin display. Empty on any error (pre-migration). */
export async function listAiVocabGroups(opts?: { activeOnly?: boolean }): Promise<AiVocabGroupRow[]> {
  try {
    const rows = await groupClient()
      .findMany({
        where: opts?.activeOnly ? { active: true } : {},
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      })
      .catch(() => [])
    return rows.map((r) => ({
      id: String(r.id),
      label: String(r.label ?? ''),
      styles: strArr(r.styles),
      colors: strArr(r.colors),
      elements: strArr(r.elements),
      sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
      active: r.active !== false,
    }))
  } catch {
    return []
  }
}

export async function createAiVocabGroup(input: { label: string; styles?: string[]; colors?: string[]; elements?: string[]; sortOrder?: number; updatedById?: string | null }): Promise<{ ok: boolean; id?: string }> {
  try {
    const row = await groupClient().create({
      data: {
        label: input.label,
        styles: input.styles ?? [],
        colors: input.colors ?? [],
        elements: input.elements ?? [],
        sortOrder: input.sortOrder ?? 0,
        updatedById: input.updatedById ?? null,
      },
    })
    return { ok: true, id: row.id }
  } catch {
    return { ok: false }
  }
}

export async function updateAiVocabGroup(id: string, patch: { label?: string; styles?: string[]; colors?: string[]; elements?: string[]; sortOrder?: number; active?: boolean; updatedById?: string | null }): Promise<{ ok: boolean }> {
  try {
    const data: Record<string, unknown> = {}
    if (patch.label !== undefined) data.label = patch.label
    if (patch.styles !== undefined) data.styles = patch.styles
    if (patch.colors !== undefined) data.colors = patch.colors
    if (patch.elements !== undefined) data.elements = patch.elements
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder
    if (patch.active !== undefined) data.active = patch.active
    if (patch.updatedById !== undefined) data.updatedById = patch.updatedById
    await groupClient().update({ where: { id }, data })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export async function deleteAiVocabGroup(id: string): Promise<{ ok: boolean }> {
  try {
    await groupClient().delete({ where: { id } })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** domain → assigned group ids (order-stable). Empty map on any error. */
export async function getDomainVocabGroupAssignments(): Promise<Record<string, string[]>> {
  try {
    const rows = await linkClient()
      .findMany({ orderBy: [{ domain: 'asc' }, { sortOrder: 'asc' }] })
      .catch(() => [])
    const out: Record<string, string[]> = {}
    for (const r of rows) {
      ;(out[r.domain] ??= []).push(r.groupId)
    }
    return out
  } catch {
    return {}
  }
}

/** Replace a single domain's group assignment set (delete-then-recreate, ordered). */
export async function setDomainVocabGroups(domain: string, groupIds: string[]): Promise<{ ok: boolean }> {
  try {
    const lc = linkClient()
    await lc.deleteMany({ where: { domain } })
    // Recreate in the given order so sortOrder reflects the admin's arrangement.
    for (let i = 0; i < groupIds.length; i++) {
      const gid = groupIds[i]
      if (!gid) continue
      await lc.create({ data: { domain, groupId: gid, sortOrder: i } })
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
