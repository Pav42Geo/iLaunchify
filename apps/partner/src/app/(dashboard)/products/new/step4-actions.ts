'use server'

// =============================================================================
// Step 4 "Packaging & die-lines" form-step actions (P4a).
// Spec: docs/STEP4_PACKAGING_DIELINES_2026-07-28.md
//
// - loadOrResolveStep4Dielines: ZERO-CLICK die-line resolution (D1). For every
//   attached container it (1) reuses the partner's existing PackagingDieline for
//   that packaging type, else (2) INSTANTIATES one from the type's house
//   template (PackagingType.defaultDieCut, #135), else (3) reports it as
//   needing attention (custom container with no house template). The
//   manufacturer is never asked to upload in the happy path.
// - loadDecorationMethods / toggleDecorationMethod: the §3.7 Decoration card.
//   ONE source with the service builders: PartnerPackagingOffering rows. Off
//   never deletes (components/on-demand pinning may reference a row): it
//   ARCHIVEs; on revives to DRAFT.
// =============================================================================

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { getSignedReadUrl } from '@ilaunchify/storage'

// DecorationMethod values offered in the card (enum minus NONE; NONE means
// "no decoration" and is not a capability to declare). NOT exported: a 'use
// server' module may only export async functions; the client keeps its own
// labeled copy (METHOD_LABELS in PackagingDielinesStep).
const DECORATION_METHODS = [
  'DIRECT_PRINT',
  'PRESSURE_SENSITIVE_LABEL',
  'SHRINK_SLEEVE',
  'IN_MOLD_LABEL',
  'HEAT_TRANSFER',
  'FOIL_STAMP',
  'EMBOSS',
  'DEBOSS',
  'SPOT_UV',
] as const
export type Step4DecorationMethod = (typeof DECORATION_METHODS)[number]

export interface Step4Dieline {
  id: string
  status: string
  /** 'own' = partner-uploaded prepress file; 'template' = auto-instantiated house shape. */
  source: 'own' | 'template'
  decorationMethod: string
  templateName: string | null
  widthMm: number | null
  heightMm: number | null
  bleedMm: number | null
  /** Flat preview (P4b): the canonical shape's cut-outline SVG path, if any. */
  outlineSvg: string | null
  /** Flat preview (P4b): signed URL of the die-line's rendered thumbnail, if any. */
  thumbUrl: string | null
}

export interface Step4DielineRow {
  systemId: string
  name: string
  packagingTypeId: string | null
  typeName: string | null
  material: string | null
  topology: string
  dieline: Step4Dieline | null
}

export interface Step4DecorationRow {
  packagingTypeId: string
  typeName: string
  methods: Array<{ method: Step4DecorationMethod; on: boolean }>
}

type Ok<T> = { ok: true; data: T }
type Err = { ok: false; error: string }

interface PartnerScope {
  user: Awaited<ReturnType<typeof requireUser>>
  partnerId: string
  serviceIds: string[]
  manufacturerServiceId: string | null
}

/** Auth + ownership guard shared by every action here (mirrors loadPackagingStudio). */
async function partnerScope(draftId: string): Promise<PartnerScope | Err> {
  const user = await requireUser()
  if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { select: { id: true } } },
  })
  if (!partner) return { ok: false, error: 'Partner not found.' }
  const tpl = await prisma.productTemplate.findUnique({
    where: { id: draftId },
    select: { manufacturerServiceId: true },
  })
  if (!tpl) return { ok: false, error: 'Draft not found.' }
  const serviceIds = partner.services.map((s) => s.id)
  if (tpl.manufacturerServiceId && !serviceIds.includes(tpl.manufacturerServiceId)) {
    return { ok: false, error: 'Not your draft.' }
  }
  return { user, partnerId: partner.id, serviceIds, manufacturerServiceId: tpl.manufacturerServiceId }
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

interface AttachedSystem {
  id: string
  name: string
  material: string | null
  topology: string
  typeId: string | null
  typeName: string | null
}

async function attachedSystems(draftId: string): Promise<AttachedSystem[]> {
  const tpl = await prisma.productTemplate.findUnique({
    where: { id: draftId },
    select: {
      packagingSystems: {
        select: {
          packagingSystem: {
            select: {
              id: true,
              partnerName: true,
              overrideDisplayName: true,
              material: true,
              topology: true,
              packagingType: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    },
  })
  return (tpl?.packagingSystems ?? []).map(({ packagingSystem: s }) => ({
    id: s.id,
    name: s.overrideDisplayName ?? s.packagingType?.displayName ?? s.partnerName,
    material: s.material,
    topology: s.topology,
    typeId: s.packagingType?.id ?? null,
    typeName: s.packagingType?.displayName ?? null,
  }))
}

export async function loadOrResolveStep4Dielines(draftId: string): Promise<Ok<Step4DielineRow[]> | Err> {
  try {
    const scope = await partnerScope(draftId)
    if ('ok' in scope) return scope
    const systems = await attachedSystems(draftId)
    const typeIds = [...new Set(systems.map((s) => s.typeId).filter((t): t is string => !!t))]

    // Existing partner die-lines for the attached types.
    const existing = typeIds.length
      ? await prisma.packagingDieline.findMany({
          where: { partnerService: { partnerId: scope.partnerId }, packagingTypeId: { in: typeIds }, status: { not: 'ARCHIVED' } },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true, packagingTypeId: true, decorationMethod: true, status: true, partnerFileId: true,
            widthMm: true, heightMm: true, bleedMm: true, thumbnailKey: true,
            canonicalShape: { select: { name: true, outlineSvg: true } },
          },
        })
      : []
    const byType = new Map<string, typeof existing>()
    for (const d of existing) {
      const arr = byType.get(d.packagingTypeId) ?? []
      arr.push(d)
      byType.set(d.packagingTypeId, arr)
    }

    // Zero-click: instantiate a house-template die-line for covered types with none.
    const missingTypeIds = typeIds.filter((t) => !(byType.get(t) ?? []).length)
    if (missingTypeIds.length && scope.serviceIds.length) {
      const serviceId = scope.manufacturerServiceId ?? scope.serviceIds[0]!
      // Cast-guarded: defaultDieCutTemplateId (#135) may post-date the generated
      // client until db:generate. A miss just means no auto-instantiation.
      let typeRows: Array<{ id: string; defaultDieCutTemplateId: string | null }> = []
      try {
        typeRows = await (prisma as unknown as {
          packagingType: { findMany: (a: unknown) => Promise<Array<{ id: string; defaultDieCutTemplateId: string | null }>> }
        }).packagingType.findMany({ where: { id: { in: missingTypeIds } }, select: { id: true, defaultDieCutTemplateId: true } })
      } catch { typeRows = [] }
      const tplIds = [...new Set(typeRows.map((r) => r.defaultDieCutTemplateId).filter((x): x is string => !!x))]
      const dieCuts = tplIds.length
        ? await prisma.dieCutTemplate.findMany({ where: { id: { in: tplIds } }, select: { id: true, name: true, widthMm: true, heightMm: true, bleedMm: true } })
        : []
      const dieCutById = new Map(dieCuts.map((d) => [d.id, d]))
      // Seed decoration from an existing offering for that type, else DIRECT_PRINT.
      const offerings = missingTypeIds.length
        ? await prisma.partnerPackagingOffering.findMany({
            where: { partnerService: { partnerId: scope.partnerId }, packagingTypeId: { in: missingTypeIds }, status: { not: 'ARCHIVED' } },
            select: { packagingTypeId: true, decorationMethod: true },
          })
        : []
      const methodByType = new Map(offerings.map((o) => [o.packagingTypeId, o.decorationMethod]))
      for (const row of typeRows) {
        const dc = row.defaultDieCutTemplateId ? dieCutById.get(row.defaultDieCutTemplateId) : undefined
        if (!dc) continue
        try {
          const created = await prisma.packagingDieline.create({
            data: {
              partnerServiceId: serviceId,
              packagingTypeId: row.id,
              decorationMethod: (methodByType.get(row.id) ?? 'DIRECT_PRINT') as never,
              widthMm: dc.widthMm,
              heightMm: dc.heightMm,
              bleedMm: dc.bleedMm,
              canonicalShapeId: dc.id,
              matchConfidence: 1,
              status: 'UPLOADED',
            },
            select: {
              id: true, packagingTypeId: true, decorationMethod: true, status: true, partnerFileId: true,
              widthMm: true, heightMm: true, bleedMm: true,
              canonicalShape: { select: { name: true } },
            },
          })
          byType.set(row.id, [created])
          await logAuditAs(scope.user, { entityType: 'PackagingDieline', entityId: created.id, action: 'PRODUCT_TEMPLATE_UPDATE', payload: { autoAttachedFromTemplate: dc.name, productTemplateId: draftId } }).catch(() => {})
        } catch { /* best-effort: the row just reports as needing attention */ }
      }
    }

    const rows: Step4DielineRow[] = await Promise.all(systems.map(async (s) => {
      const candidates = s.typeId ? (byType.get(s.typeId) ?? []) : []
      // Prefer the partner's own uploaded file; else the newest (template) row.
      const pick = candidates.find((d) => d.partnerFileId) ?? candidates[0] ?? null
      const thumbUrl = pick?.thumbnailKey ? await getSignedReadUrl(pick.thumbnailKey).catch(() => null) : null
      return {
        systemId: s.id,
        name: s.name,
        packagingTypeId: s.typeId,
        typeName: s.typeName,
        material: s.material,
        topology: s.topology,
        dieline: pick
          ? {
              id: pick.id,
              status: pick.status,
              source: pick.partnerFileId ? 'own' : 'template',
              decorationMethod: pick.decorationMethod,
              templateName: pick.canonicalShape?.name ?? null,
              widthMm: num(pick.widthMm),
              heightMm: num(pick.heightMm),
              bleedMm: num(pick.bleedMm),
              outlineSvg: pick.canonicalShape?.outlineSvg ?? null,
              thumbUrl,
            }
          : null,
      }
    }))
    return { ok: true, data: rows }
  } catch (err) {
    console.error('[loadOrResolveStep4Dielines] failed:', err)
    return { ok: false, error: 'Could not load die-lines.' }
  }
}

export async function loadDecorationMethods(draftId: string): Promise<Ok<Step4DecorationRow[]> | Err> {
  try {
    const scope = await partnerScope(draftId)
    if ('ok' in scope) return scope
    const systems = await attachedSystems(draftId)
    const typed = systems.filter((s) => s.typeId)
    const typeIds = [...new Set(typed.map((s) => s.typeId!))]
    const offerings = typeIds.length
      ? await prisma.partnerPackagingOffering.findMany({
          where: { partnerService: { partnerId: scope.partnerId }, packagingTypeId: { in: typeIds } },
          select: { packagingTypeId: true, decorationMethod: true, status: true },
        })
      : []
    const onSet = new Set(offerings.filter((o) => o.status !== 'ARCHIVED').map((o) => `${o.packagingTypeId}:${o.decorationMethod}`))
    const seen = new Set<string>()
    const rows: Step4DecorationRow[] = []
    for (const s of typed) {
      if (seen.has(s.typeId!)) continue
      seen.add(s.typeId!)
      rows.push({
        packagingTypeId: s.typeId!,
        typeName: s.typeName ?? s.name,
        methods: DECORATION_METHODS.map((m) => ({ method: m, on: onSet.has(`${s.typeId}:${m}`) })),
      })
    }
    return { ok: true, data: rows }
  } catch (err) {
    console.error('[loadDecorationMethods] failed:', err)
    return { ok: false, error: 'Could not load decoration methods.' }
  }
}

export async function toggleDecorationMethod(
  draftId: string,
  packagingTypeId: string,
  method: Step4DecorationMethod,
  on: boolean,
): Promise<{ ok: true } | Err> {
  try {
    if (!DECORATION_METHODS.includes(method)) return { ok: false, error: 'Unknown decoration method.' }
    const scope = await partnerScope(draftId)
    if ('ok' in scope) return scope
    const existing = await prisma.partnerPackagingOffering.findFirst({
      where: { partnerService: { partnerId: scope.partnerId }, packagingTypeId, decorationMethod: method as never },
      select: { id: true, status: true },
    })
    if (on) {
      if (existing) {
        if (existing.status === 'ARCHIVED') {
          await prisma.partnerPackagingOffering.update({ where: { id: existing.id }, data: { status: 'DRAFT' } })
        }
      } else {
        const serviceId = scope.manufacturerServiceId ?? scope.serviceIds[0]
        if (!serviceId) return { ok: false, error: 'No partner service to attach the offering to.' }
        await prisma.partnerPackagingOffering.create({
          data: { partnerServiceId: serviceId, packagingTypeId, decorationMethod: method as never, status: 'DRAFT' },
        })
      }
    } else if (existing && existing.status !== 'ARCHIVED') {
      // Never delete: components / on-demand pinning may reference the row.
      await prisma.partnerPackagingOffering.update({ where: { id: existing.id }, data: { status: 'ARCHIVED' } })
    }
    await logAuditAs(scope.user, { entityType: 'ProductTemplate', entityId: draftId, action: 'PRODUCT_TEMPLATE_UPDATE', payload: { decoration: { packagingTypeId, method, on } } }).catch(() => {})
    return { ok: true }
  } catch (err) {
    console.error('[toggleDecorationMethod] failed:', err)
    return { ok: false, error: 'Could not update decoration methods.' }
  }
}

export interface Step4PackagingSystem {
  id: string
  partnerName: string
  topology: string
  unitCount: number
  moq: number
  grossWeightG?: number | null
  casesPerLayer?: number | null
  layersPerPallet?: number | null
}

/** The partner's OWN packaging-system list, fetched live so systems created
 *  inside the studio modal (status DRAFT) appear in the picker without a page
 *  reload (Pavel 2026-07-29). RETIRED rows are hidden. Cast-guarded like
 *  page.tsx: grossWeightG / casesPerLayer / layersPerPallet post-date the
 *  generated client until db:push. */
export async function listMyPackagingSystems(): Promise<Ok<Step4PackagingSystem[]> | Err> {
  try {
    const user = await requireUser()
    if (user.role !== 'PARTNER') return { ok: false, error: 'Not a partner account.' }
    const partner = await prisma.partner.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!partner) return { ok: false, error: 'Partner not found.' }
    const rows = await (prisma as unknown as {
      packagingSystem: { findMany: (a: unknown) => Promise<Array<{ id: string; partnerName: string; topology: string; unitCount: number; moq: number; grossWeightG: number | null; casesPerLayer: number | null; layersPerPallet: number | null }>> }
    }).packagingSystem.findMany({
      where: { partnerId: partner.id, status: { not: 'RETIRED' } },
      select: { id: true, partnerName: true, topology: true, unitCount: true, moq: true, grossWeightG: true, casesPerLayer: true, layersPerPallet: true },
      orderBy: { partnerName: 'asc' },
    })
    return { ok: true, data: rows }
  } catch (err) {
    console.error('[listMyPackagingSystems] failed:', err)
    return { ok: false, error: 'Could not load packaging systems.' }
  }
}

/** P4b measurement fix-up: partner-entered prepress spec on their own die-line.
 *  Layout/frames stay untouched; this only corrects the declared dimensions. */
export async function updateDielineSpec(
  draftId: string,
  dielineId: string,
  spec: { widthMm: number | null; heightMm: number | null; bleedMm: number | null },
): Promise<{ ok: true } | Err> {
  try {
    const scope = await partnerScope(draftId)
    if ('ok' in scope) return scope
    const owned = await prisma.packagingDieline.findFirst({
      where: { id: dielineId, partnerService: { partnerId: scope.partnerId } },
      select: { id: true },
    })
    if (!owned) return { ok: false, error: 'Not your die-line.' }
    const clamp = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 && v < 10000 ? v : null)
    await prisma.packagingDieline.update({
      where: { id: dielineId },
      data: { widthMm: clamp(spec.widthMm), heightMm: clamp(spec.heightMm), bleedMm: clamp(spec.bleedMm) ?? 3.0 },
    })
    await logAuditAs(scope.user, { entityType: 'PackagingDieline', entityId: dielineId, action: 'PRODUCT_TEMPLATE_UPDATE', payload: { specFixup: spec, productTemplateId: draftId } }).catch(() => {})
    return { ok: true }
  } catch (err) {
    console.error('[updateDielineSpec] failed:', err)
    return { ok: false, error: 'Could not save measurements.' }
  }
}
