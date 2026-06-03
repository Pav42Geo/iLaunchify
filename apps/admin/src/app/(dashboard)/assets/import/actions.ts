'use server'

// C7 — bulk JSON import per asset family. Each importer parses a JSON array,
// validates per-row, and upserts. Idempotent by natural key (symbol slug;
// cert-type slug + variant label). Returns a per-run summary; row errors are
// collected, not thrown, so a partial batch still imports the good rows.

import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

export interface ImportSummary {
  ok: boolean
  created: number
  updated: number
  variantsCreated: number
  skipped: number
  errors: string[]
}

const PACKAGING_FAMILIES = ['RESIN_CODE', 'RECYCLING_MARK', 'COMPOSTABILITY', 'DISPOSAL', 'OTHER']
const LABELING_FAMILIES = ['ATTRIBUTION', 'STORAGE', 'ALLERGEN', 'DISCLOSURE', 'WARNING', 'OTHER']
const REQUIREMENTS = ['REQUIRED', 'RECOMMENDED', 'OPTIONAL']
const CERT_VARIANT_KINDS = ['COLOR', 'BLACK_WHITE', 'OUTLINE', 'CONTEXTUAL']
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

function parseArray(json: string): { rows?: unknown[]; error?: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    return { error: `Invalid JSON: ${(err as Error).message}` }
  }
  if (!Array.isArray(parsed)) return { error: 'Top-level JSON must be an array.' }
  return { rows: parsed }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

interface VariantJson {
  label?: unknown
  kind?: unknown
  minWidthMm?: unknown
  maxWidthMm?: unknown
  approvedColorSpec?: unknown
  requiredCoText?: unknown
  clearSpaceFactor?: unknown
  brandGuidelinesUrl?: unknown
  notes?: unknown
}

function variantScalars(v: VariantJson) {
  return {
    minWidthMm: num(v.minWidthMm),
    maxWidthMm: num(v.maxWidthMm),
    approvedColorSpec: str(v.approvedColorSpec),
    clearSpaceFactor: num(v.clearSpaceFactor),
    brandGuidelinesUrl: str(v.brandGuidelinesUrl),
    notes: str(v.notes),
  }
}

// ---------------------------------------------------------------------------
// Packaging symbols
// ---------------------------------------------------------------------------

export async function importPackagingSymbols(json: string): Promise<ImportSummary> {
  const admin = await requireRole('ADMIN')
  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsCreated: 0, skipped: 0, errors: [] }
  const { rows, error } = parseArray(json)
  if (error || !rows) return { ...summary, ok: false, errors: [error ?? 'Parse failed.'] }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>
    const label = `row ${i + 1}`
    try {
      const name = str(r.name)
      const slug = str(r.slug)?.toLowerCase()
      const family = str(r.family)
      if (!name || !slug) {
        summary.errors.push(`${label}: name + slug required.`)
        summary.skipped++
        continue
      }
      if (!SLUG_REGEX.test(slug)) {
        summary.errors.push(`${label}: invalid slug "${slug}".`)
        summary.skipped++
        continue
      }
      if (!family || !PACKAGING_FAMILIES.includes(family)) {
        summary.errors.push(`${label}: family must be one of ${PACKAGING_FAMILIES.join(', ')}.`)
        summary.skipped++
        continue
      }
      const requirement = str(r.requirement) && REQUIREMENTS.includes(str(r.requirement)!) ? str(r.requirement)! : 'OPTIONAL'

      const data = {
        name,
        family: family as never,
        description: str(r.description),
        applicableSubstrates: strArr(r.applicableSubstrates),
        applicableMaterials: strArr(r.applicableMaterials),
        applicableMarkets: strArr(r.applicableMarkets),
        requirement: requirement as never,
        requiredWhen: str(r.requiredWhen),
      }

      const existing = await prisma.packagingSymbol.findUnique({ where: { slug }, select: { id: true } })
      let symbolId: string
      if (existing) {
        await prisma.packagingSymbol.update({ where: { slug }, data })
        symbolId = existing.id
        summary.updated++
      } else {
        const created = await prisma.packagingSymbol.create({ data: { slug, status: 'ACTIVE', ...data } })
        symbolId = created.id
        summary.created++
      }

      // Variants — create those whose label isn't already present.
      const variants = Array.isArray(r.variants) ? (r.variants as VariantJson[]) : []
      if (variants.length) {
        const have = new Set(
          (await prisma.packagingSymbolVariant.findMany({ where: { packagingSymbolId: symbolId }, select: { label: true } })).map((v) => v.label),
        )
        let order = have.size
        for (const v of variants) {
          const vl = str(v.label)
          if (!vl || have.has(vl)) continue
          await prisma.packagingSymbolVariant.create({
            data: { packagingSymbolId: symbolId, label: vl, sortOrder: order++, ...variantScalars(v) },
          })
          have.add(vl)
          summary.variantsCreated++
        }
      }
    } catch (err) {
      summary.errors.push(`${label}: ${(err as Error).message}`)
      summary.skipped++
    }
  }

  await logAuditAs(admin, {
    entityType: 'PackagingSymbol',
    entityId: 'bulk-import',
    action: 'PACKAGING_SYMBOL_BULK_IMPORT',
    payload: { created: summary.created, updated: summary.updated, variantsCreated: summary.variantsCreated, skipped: summary.skipped },
  })

  revalidatePath('/assets/packaging-symbols')
  return summary
}

// ---------------------------------------------------------------------------
// Labeling symbols
// ---------------------------------------------------------------------------

export async function importLabelingSymbols(json: string): Promise<ImportSummary> {
  const admin = await requireRole('ADMIN')
  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsCreated: 0, skipped: 0, errors: [] }
  const { rows, error } = parseArray(json)
  if (error || !rows) return { ...summary, ok: false, errors: [error ?? 'Parse failed.'] }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>
    const label = `row ${i + 1}`
    try {
      const name = str(r.name)
      const slug = str(r.slug)?.toLowerCase()
      const family = str(r.family)
      if (!name || !slug) {
        summary.errors.push(`${label}: name + slug required.`)
        summary.skipped++
        continue
      }
      if (!SLUG_REGEX.test(slug)) {
        summary.errors.push(`${label}: invalid slug "${slug}".`)
        summary.skipped++
        continue
      }
      if (!family || !LABELING_FAMILIES.includes(family)) {
        summary.errors.push(`${label}: family must be one of ${LABELING_FAMILIES.join(', ')}.`)
        summary.skipped++
        continue
      }
      const requirement = str(r.requirement) && REQUIREMENTS.includes(str(r.requirement)!) ? str(r.requirement)! : 'OPTIONAL'

      const data = {
        name,
        family: family as never,
        description: str(r.description),
        applicableCategorySlugs: strArr(r.applicableCategorySlugs),
        applicableMarkets: strArr(r.applicableMarkets),
        requirement: requirement as never,
        requiredWhen: str(r.requiredWhen),
        requiredCoText: str(r.requiredCoText),
      }

      const existing = await prisma.labelingSymbol.findUnique({ where: { slug }, select: { id: true } })
      let symbolId: string
      if (existing) {
        await prisma.labelingSymbol.update({ where: { slug }, data })
        symbolId = existing.id
        summary.updated++
      } else {
        const created = await prisma.labelingSymbol.create({ data: { slug, status: 'ACTIVE', ...data } })
        symbolId = created.id
        summary.created++
      }

      const variants = Array.isArray(r.variants) ? (r.variants as VariantJson[]) : []
      if (variants.length) {
        const have = new Set(
          (await prisma.labelingSymbolVariant.findMany({ where: { labelingSymbolId: symbolId }, select: { label: true } })).map((v) => v.label),
        )
        let order = have.size
        for (const v of variants) {
          const vl = str(v.label)
          if (!vl || have.has(vl)) continue
          await prisma.labelingSymbolVariant.create({
            data: { labelingSymbolId: symbolId, label: vl, sortOrder: order++, ...variantScalars(v) },
          })
          have.add(vl)
          summary.variantsCreated++
        }
      }
    } catch (err) {
      summary.errors.push(`${label}: ${(err as Error).message}`)
      summary.skipped++
    }
  }

  await logAuditAs(admin, {
    entityType: 'LabelingSymbol',
    entityId: 'bulk-import',
    action: 'LABELING_SYMBOL_BULK_IMPORT',
    payload: { created: summary.created, updated: summary.updated, variantsCreated: summary.variantsCreated, skipped: summary.skipped },
  })

  revalidatePath('/assets/labeling-symbols')
  return summary
}

// ---------------------------------------------------------------------------
// Certificate asset variants — keyed by certificateTypeSlug
// ---------------------------------------------------------------------------

export async function importCertificateVariants(json: string): Promise<ImportSummary> {
  const admin = await requireRole('ADMIN')
  const summary: ImportSummary = { ok: true, created: 0, updated: 0, variantsCreated: 0, skipped: 0, errors: [] }
  const { rows, error } = parseArray(json)
  if (error || !rows) return { ...summary, ok: false, errors: [error ?? 'Parse failed.'] }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Record<string, unknown>
    const label = `row ${i + 1}`
    try {
      const certSlug = str(r.certificateTypeSlug)?.toLowerCase()
      if (!certSlug) {
        summary.errors.push(`${label}: certificateTypeSlug required.`)
        summary.skipped++
        continue
      }
      const ct = await prisma.certificateType.findUnique({ where: { slug: certSlug }, select: { id: true } })
      if (!ct) {
        summary.errors.push(`${label}: no certificate type with slug "${certSlug}".`)
        summary.skipped++
        continue
      }
      const variants = Array.isArray(r.variants) ? (r.variants as VariantJson[]) : []
      const have = new Set(
        (await prisma.certificateAssetVariant.findMany({ where: { certificateTypeId: ct.id }, select: { label: true } })).map((v) => v.label),
      )
      let order = have.size
      for (const v of variants) {
        const vl = str(v.label)
        const kind = str(v.kind)
        if (!vl) {
          summary.errors.push(`${label}: a variant is missing label.`)
          continue
        }
        if (!kind || !CERT_VARIANT_KINDS.includes(kind)) {
          summary.errors.push(`${label} "${vl}": kind must be one of ${CERT_VARIANT_KINDS.join(', ')}.`)
          continue
        }
        if (have.has(vl)) continue
        await prisma.certificateAssetVariant.create({
          data: {
            certificateTypeId: ct.id,
            kind: kind as never,
            label: vl,
            requiredCoText: str(v.requiredCoText),
            sortOrder: order++,
            ...variantScalars(v),
          },
        })
        have.add(vl)
        summary.variantsCreated++
      }
      summary.updated++
    } catch (err) {
      summary.errors.push(`${label}: ${(err as Error).message}`)
      summary.skipped++
    }
  }

  await logAuditAs(admin, {
    entityType: 'CertificateAssetVariant',
    entityId: 'bulk-import',
    action: 'CERT_ASSET_VARIANT_BULK_IMPORT',
    payload: { variantsCreated: summary.variantsCreated, skipped: summary.skipped },
  })

  revalidatePath('/certificate-types')
  return summary
}
