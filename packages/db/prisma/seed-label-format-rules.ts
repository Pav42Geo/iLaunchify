// Track C / C1.b — LabelFormatRule catalog seed.
//
// One row per (LabelFormat × LabelingType). These rules drive the
// recommendLabelFormats algorithm (C4): which FDA-approved formats are OFFERED
// for a given dieline size + labeling type + flavor count, ranked by
// preferenceScore.
//
// ⚠️ STARTER CONSTANTS. The dimensional + font thresholds below are reasonable
// FDA/AAFCO-derived approximations sufficient to GATE which formats are offered
// — they do NOT control rendered output. The exact, counsel-verified CFR
// constants land in the C-extend rule-pack research (us-fda-food-2026.json
// etc.). Citations are real; the numbers are conservative starters. Idempotent.

import type { PrismaClient, LabelFormat, LabelingType, PanelOrientation } from '@prisma/client'

interface RuleSeed {
  format: LabelFormat
  labelingType: LabelingType
  cfrCitation: string
  minSurfaceAreaSqIn: number
  minLabelWidthMm: number
  minLabelHeightMm: number
  minFontSizePt: number
  minHeaderFontSizePt: number
  supportsMultiColumn?: boolean
  supportsAggregate?: boolean
  supportsDualColumn?: boolean
  panelOrientation: PanelOrientation
  preferenceScore: number
  notes?: string
}

const RULES: RuleSeed[] = [
  // ---- FOOD — FDA Nutrition Facts (21 CFR 101.9) ----
  { format: 'FDA_VERTICAL', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(d)', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 100, notes: 'Standard Nutrition Facts panel.' },
  { format: 'FDA_TABULAR', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(j)(13)(ii)(A)(1)', minSurfaceAreaSqIn: 3, minLabelWidthMm: 65, minLabelHeightMm: 30, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'TABULAR', preferenceScore: 70, notes: 'Horizontal table when the vertical panel does not fit.' },
  { format: 'FDA_LINEAR', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(j)(13)(ii)(A)(2)', minSurfaceAreaSqIn: 0, minLabelWidthMm: 20, minLabelHeightMm: 8, minFontSizePt: 6, minHeaderFontSizePt: 6, panelOrientation: 'LINEAR', preferenceScore: 30, notes: 'Single-line format for very small packages (<12 sq in total surface).' },
  { format: 'FDA_AS_PACKAGED_AS_PREPARED', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(e)', minSurfaceAreaSqIn: 6, minLabelWidthMm: 50, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, supportsDualColumn: true, panelOrientation: 'VERTICAL', preferenceScore: 50, notes: 'Dual-column “as packaged” + “as prepared”.' },
  { format: 'FDA_AGGREGATE', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(h)(4)', minSurfaceAreaSqIn: 8, minLabelWidthMm: 60, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, supportsMultiColumn: true, supportsAggregate: true, panelOrientation: 'VERTICAL', preferenceScore: 50, notes: 'Multi-flavor aggregate / variety pack.' },
  { format: 'FDA_INFANT', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(j)(5)', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 40, notes: 'Infant 0-12 months only.' },
  { format: 'FDA_CHILD', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(j)(5)', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 40, notes: 'Children 1-3 years only.' },
  { format: 'FDA_100_GRAMS', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9(c)', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 35, notes: 'Per-100g presentation (export-friendly).' },

  // ---- FOOD — USDA / Old FDA legacy (pre-2016 compatibility) ----
  { format: 'USDA_OLD_FDA_VERTICAL', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9 (pre-2016)', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 20, notes: 'Legacy pre-2016 format — compatibility only.' },
  { format: 'USDA_OLD_FDA_TABULAR', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9 (pre-2016)', minSurfaceAreaSqIn: 3, minLabelWidthMm: 65, minLabelHeightMm: 30, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'TABULAR', preferenceScore: 15, notes: 'Legacy pre-2016 tabular — compatibility only.' },
  { format: 'USDA_OLD_FDA_LINEAR', labelingType: 'FOOD', cfrCitation: '21 CFR 101.9 (pre-2016)', minSurfaceAreaSqIn: 0, minLabelWidthMm: 20, minLabelHeightMm: 8, minFontSizePt: 6, minHeaderFontSizePt: 6, panelOrientation: 'LINEAR', preferenceScore: 10, notes: 'Legacy pre-2016 linear — compatibility only.' },

  // ---- FOOD — Canadian (V1.1 schema-ready; low preference in US default) ----
  { format: 'CANADIAN_VERTICAL', labelingType: 'FOOD', cfrCitation: 'FDR B.01.401', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 25, notes: 'Canada (V1.1 — schema-ready).' },
  { format: 'CANADIAN_LINEAR', labelingType: 'FOOD', cfrCitation: 'FDR B.01.454', minSurfaceAreaSqIn: 0, minLabelWidthMm: 20, minLabelHeightMm: 8, minFontSizePt: 6, minHeaderFontSizePt: 6, panelOrientation: 'LINEAR', preferenceScore: 18, notes: 'Canada (V1.1).' },
  { format: 'CANADIAN_HORIZONTAL', labelingType: 'FOOD', cfrCitation: 'FDR B.01.459', minSurfaceAreaSqIn: 3, minLabelWidthMm: 65, minLabelHeightMm: 30, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'HORIZONTAL', preferenceScore: 18, notes: 'Canada (V1.1).' },
  { format: 'CANADIAN_AGGREGATE', labelingType: 'FOOD', cfrCitation: 'FDR B.01.406', minSurfaceAreaSqIn: 8, minLabelWidthMm: 60, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, supportsMultiColumn: true, supportsAggregate: true, panelOrientation: 'VERTICAL', preferenceScore: 18, notes: 'Canada (V1.1).' },
  { format: 'CANADIAN_100_GRAMS', labelingType: 'FOOD', cfrCitation: 'FDR B.01.401', minSurfaceAreaSqIn: 5, minLabelWidthMm: 40, minLabelHeightMm: 55, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 18, notes: 'Canada (V1.1).' },

  // ---- DIETARY_SUPPLEMENT — FDA Supplement Facts (21 CFR 101.36) ----
  { format: 'FDA_SUPPLEMENT', labelingType: 'DIETARY_SUPPLEMENT', cfrCitation: '21 CFR 101.36', minSurfaceAreaSqIn: 4, minLabelWidthMm: 35, minLabelHeightMm: 45, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 100, notes: 'Supplement Facts panel.' },

  // ---- OTC — FDA Drug Facts (21 CFR 201.66) ----
  { format: 'FDA_DRUG_FACTS', labelingType: 'OTC', cfrCitation: '21 CFR 201.66', minSurfaceAreaSqIn: 4, minLabelWidthMm: 40, minLabelHeightMm: 50, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 100, notes: 'Drug Facts panel — Active Ingredients / Uses / Warnings / Directions.' },

  // ---- PET_PRODUCT — AAFCO ----
  { format: 'AAFCO_PET_FOOD', labelingType: 'PET_PRODUCT', cfrCitation: 'AAFCO Model Regs (Pet Food)', minSurfaceAreaSqIn: 4, minLabelWidthMm: 40, minLabelHeightMm: 45, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 100, notes: 'Guaranteed Analysis + Ingredients + Feeding Directions.' },
  { format: 'AAFCO_PET_TREAT', labelingType: 'PET_PRODUCT', cfrCitation: 'AAFCO Model Regs (Pet Food)', minSurfaceAreaSqIn: 2, minLabelWidthMm: 30, minLabelHeightMm: 30, minFontSizePt: 6, minHeaderFontSizePt: 8, panelOrientation: 'VERTICAL', preferenceScore: 60, notes: 'Simplified treat format.' },
]

export async function seedLabelFormatRules(prisma: PrismaClient): Promise<void> {
  let upserts = 0
  for (const r of RULES) {
    await prisma.labelFormatRule.upsert({
      where: { format_labelingType: { format: r.format, labelingType: r.labelingType } },
      create: {
        format: r.format,
        labelingType: r.labelingType,
        cfrCitation: r.cfrCitation,
        minSurfaceAreaSqIn: r.minSurfaceAreaSqIn,
        minLabelWidthMm: r.minLabelWidthMm,
        minLabelHeightMm: r.minLabelHeightMm,
        minFontSizePt: r.minFontSizePt,
        minHeaderFontSizePt: r.minHeaderFontSizePt,
        supportsMultiColumn: r.supportsMultiColumn ?? false,
        supportsAggregate: r.supportsAggregate ?? false,
        supportsDualColumn: r.supportsDualColumn ?? false,
        panelOrientation: r.panelOrientation,
        preferenceScore: r.preferenceScore,
        notes: r.notes ?? null,
      },
      update: {
        cfrCitation: r.cfrCitation,
        minSurfaceAreaSqIn: r.minSurfaceAreaSqIn,
        minLabelWidthMm: r.minLabelWidthMm,
        minLabelHeightMm: r.minLabelHeightMm,
        minFontSizePt: r.minFontSizePt,
        minHeaderFontSizePt: r.minHeaderFontSizePt,
        supportsMultiColumn: r.supportsMultiColumn ?? false,
        supportsAggregate: r.supportsAggregate ?? false,
        supportsDualColumn: r.supportsDualColumn ?? false,
        panelOrientation: r.panelOrientation,
        preferenceScore: r.preferenceScore,
        notes: r.notes ?? null,
      },
    })
    upserts++
  }
  console.log(`✅ LabelFormatRule catalog: ${upserts} format rules upserted`)
}
