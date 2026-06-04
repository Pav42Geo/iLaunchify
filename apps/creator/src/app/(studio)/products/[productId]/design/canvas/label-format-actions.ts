'use server'

// Track C / C4.a — server action: recommend label formats for a label surface.
// Loads the LabelFormatRule catalog for the labeling type, maps Decimal → number,
// and runs the pure ranker. Consumed by the Studio's Label drawer format picker
// (C4.b). Returns FDA-approved formats only, recommended-first.

import { prisma } from '@ilaunchify/db'
import type { LabelingType, PanelOrientation } from '@ilaunchify/db'
import { rankLabelFormats, trimSurfaceAreaSqIn } from './lib/labelFormats'

export interface RecommendedFormat {
  format: string
  cfrCitation: string
  panelOrientation: PanelOrientation
  supportsMultiColumn: boolean
  supportsAggregate: boolean
  supportsDualColumn: boolean
  preferenceScore: number
  notes: string | null
  // ranker inputs (kept so the picker can show "why")
  minSurfaceAreaSqIn: number
  minLabelWidthMm: number
  minLabelHeightMm: number
  minFontSizePt: number
  minHeaderFontSizePt: number
}

export interface RecommendFormatsResult {
  recommended: RecommendedFormat | null
  alternatives: RecommendedFormat[]
  /** Computed trim surface area used for the decision (sq in). */
  trimSurfaceAreaSqIn: number
}

export async function recommendLabelFormats(input: {
  labelingType: LabelingType
  widthMm: number
  heightMm: number
  flavorCount?: number
}): Promise<RecommendFormatsResult> {
  const rules = await prisma.labelFormatRule.findMany({
    where: { labelingType: input.labelingType },
  })

  // Only offer formats appropriate for a current US product. The catalog also
  // carries Canadian (V1.1, schema-ready), USDA/Old-FDA legacy, and the
  // special-population infant/child formats — none of which should appear for a
  // normal US SKU. They stay seeded (for V1.1 / category-aware selection later)
  // but are excluded from the picker here.
  const offerable = rules.filter(
    (r) =>
      !r.format.startsWith('CANADIAN_') &&
      !r.format.startsWith('USDA_OLD_FDA_') &&
      r.format !== 'FDA_INFANT' &&
      r.format !== 'FDA_CHILD',
  )

  const lite: RecommendedFormat[] = offerable.map((r) => ({
    format: r.format,
    cfrCitation: r.cfrCitation,
    panelOrientation: r.panelOrientation,
    supportsMultiColumn: r.supportsMultiColumn,
    supportsAggregate: r.supportsAggregate,
    supportsDualColumn: r.supportsDualColumn,
    preferenceScore: r.preferenceScore,
    notes: r.notes,
    minSurfaceAreaSqIn: Number(r.minSurfaceAreaSqIn),
    minLabelWidthMm: Number(r.minLabelWidthMm),
    minLabelHeightMm: Number(r.minLabelHeightMm),
    minFontSizePt: Number(r.minFontSizePt),
    minHeaderFontSizePt: Number(r.minHeaderFontSizePt),
  }))

  const area = trimSurfaceAreaSqIn(input.widthMm, input.heightMm)
  const { recommended, alternatives } = rankLabelFormats(lite, {
    trimSurfaceAreaSqIn: area,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    flavorCount: input.flavorCount ?? 1,
  })

  return { recommended, alternatives, trimSurfaceAreaSqIn: area }
}
