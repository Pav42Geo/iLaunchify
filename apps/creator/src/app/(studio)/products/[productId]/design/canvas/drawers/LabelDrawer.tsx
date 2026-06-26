'use client'

// LabelDrawer — left-rail Label / Nutrition Facts tool.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #2:
//   - FDA Standard recommendation
//   - Style picker (Standard / Tabular V2)
//   - Ink + Background colors with brand swatches accessible
//   - Width slider so the panel fits the available label space
//   - Add to canvas (drops as a fabric.Group)
//
// Data binding decision: V1 ships with sample placeholder values. The real
// per-product nutrition data lands at print/export time via the existing
// WeasyPrint label render service (compliance service + label renderer
// shipped in tasks #34 / #42). The canvas is for placement; the values get
// snapped to the bound recipe on PDF generation.

import * as React from 'react'
import { Plus, Check, Target, ShieldCheck, Trash2, Lock } from 'lucide-react'
import {
  addNutritionFactsPanel,
  addAggregateNutritionPanel,
  SAMPLE_AGGREGATE_NUTRITION_DATA,
  addSupplementFactsPanel,
  SAMPLE_SUPPLEMENT_DATA,
  addAafcoPanel,
  SAMPLE_AAFCO_DATA,
  addDrugFactsPanel,
  SAMPLE_DRUG_FACTS_DATA,
  addLabelSection,
  Checkbox,
  LABEL_SECTION_LABELS,
  SAMPLE_NUTRITION_DATA,
  type BrandCanvasAssets,
  type CanvasCustomType,
  type DieCutSpec,
  type FabricCanvas,
  type LabelSectionRole,
  type NutritionPanelData,
  type AggregateNutritionData,
  type SupplementPanelData,
  type AafcoPanelData,
} from '@ilaunchify/ui'
import { addManagedNutritionPanel } from '../lib/managedNutritionPanel'
import { useCanvasRoles } from '../useCanvasRoles'
import { InfoTip } from '../InfoTip'
import type { CertBadge } from '../cert-badge-actions'
import type { LabelingType } from '@ilaunchify/db'
import { LabelFormatPicker } from './LabelFormatPicker'
import { ClaimSuggestions } from './ClaimSuggestions'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
  /** The product's earned cert badges (Certifications section). */
  certBadges?: CertBadge[]
  /**
   * C8 — request to add a cert badge. The shell decides: place immediately if
   * already consented, else open the consent modal first (never auto-stamp).
   */
  onRequestAddCert?: (badge: CertBadge) => void
  /** C4.b — product labeling type, drives the label-format picker. */
  labelingType?: LabelingType
  /** Die-cut spec — label surface dims for the format picker. */
  dieCut?: DieCutSpec
  /**
   * Optional product context used to pre-fill required-section text. When
   * available, "Add Statement of identity" drops the actual product name
   * instead of "Product Name", etc.
   */
  productCtx?: {
    productName?: string
    brandName?: string
    netQuantity?: string | null
    allergens?: string[]
  }
  /** Phase 2b — REAL Nutrition Facts data for the active flavor/base (null →
   *  non-FOOD or no recipe → fall back to sample). Drives the panel's content. */
  nutritionPanelData?: NutritionPanelData | null
  /** Phase 2b — REAL multi-column aggregate (variety box). null → sample. */
  aggregateNutritionData?: AggregateNutritionData | null
  /** Phase 2b — REAL non-FOOD panels (supplement / pet). null → sample. */
  nonFoodPanelData?: { supplement: SupplementPanelData | null; aafco: AafcoPanelData | null } | null
  /** The active flavor whose nutrition this is (null = base), for the binding. */
  activeFlavorPresetId?: string | null
  /** Recipe hash stamped on the panel for the staleness gate. */
  recipeHash?: string | null
}


export function LabelDrawer({
  canvas,
  brandAssets,
  certBadges = [],
  onRequestAddCert,
  labelingType,
  dieCut,
  productCtx,
  nutritionPanelData,
  aggregateNutritionData,
  nonFoodPanelData,
  activeFlavorPresetId = null,
  recipeHash = null,
}: Props) {
  const canvasRoles = useCanvasRoles(canvas)

  // Ink/bg/border kept at defaults — restyling lives on the panel's own toolbar.
  const [ink] = React.useState('#000000')
  /** null sentinel for transparent. */
  const [bg] = React.useState<string | null>('#FFFFFF')
  const [border] = React.useState(true)
  const [adding, setAdding] = React.useState(false)
  // C3.b — per-section visibility toggles, applied at add time.
  const [showTitle, setShowTitle] = React.useState(true)
  const [showFootnote, setShowFootnote] = React.useState(true)
  const sections = { hideTitle: !showTitle, hideFootnote: !showFootnote }
  // C4 — the format chosen in the picker, applied to the nutrition panel.
  const [selectedFormat, setSelectedFormat] = React.useState<string | null>(null)
  // C5 — variety-pack flavor count. >1 (FOOD only) renders the aggregate
  // multi-column panel and steers the picker toward FDA_AGGREGATE.
  const [flavorCount, setFlavorCount] = React.useState(1)
  const isFood = !labelingType || labelingType === 'FOOD'
  const aggregate = isFood && flavorCount > 1

  // Which facts panel applies to this product + whether it's already on the
  // canvas (drives the add/remove toggle on the button).
  const panelType: CanvasCustomType =
    labelingType === 'DIETARY_SUPPLEMENT'
      ? 'supplement-panel'
      : labelingType === 'PET_PRODUCT'
        ? 'aafco-panel'
        : labelingType === 'OTC'
          ? 'drug-facts-panel'
          : aggregate
            ? 'nutrition-aggregate-panel'
            : 'nutrition-panel'
  const panelLabel =
    labelingType === 'DIETARY_SUPPLEMENT'
      ? 'Supplement Facts'
      : labelingType === 'PET_PRODUCT'
        ? 'Guaranteed Analysis'
        : labelingType === 'OTC'
          ? 'Drug Facts'
          : 'Nutrition Facts'
  const panelOnCanvas = !!canvasRoles.findPanel(panelType)
  // Human-readable labeling regime — shown in the locked banner so the creator
  // can SEE which Facts panel their product type requires (never a free choice).
  const regimeLabel =
    labelingType === 'DIETARY_SUPPLEMENT'
      ? 'Dietary supplement'
      : labelingType === 'PET_PRODUCT'
        ? 'Pet product'
        : labelingType === 'OTC'
          ? 'OTC drug'
          : labelingType === 'COSMETIC'
            ? 'Cosmetic'
            : 'Food'

  async function handleAdd() {
    if (!canvas) return
    setAdding(true)
    try {
      if (aggregate) {
        // Phase 2b — REAL per-flavor columns when available; else sample sliced
        // by the flavor-count control.
        await addAggregateNutritionPanel(
          canvas,
          aggregateNutritionData ?? {
            flavors: SAMPLE_AGGREGATE_NUTRITION_DATA.flavors.slice(0, flavorCount),
            footnote: SAMPLE_AGGREGATE_NUTRITION_DATA.footnote,
          },
          { ink, bg, border, sections },
        )
      } else {
        // Phase 2b — REAL recipe nutrition for the active flavor (or base);
        // falls back to sample only when there's no FOOD recipe to compute from.
        await addManagedNutritionPanel(
          canvas,
          nutritionPanelData ?? SAMPLE_NUTRITION_DATA,
          { flavorPresetId: activeFlavorPresetId, recipeHash },
          { ink, bg, border, sections, format: selectedFormat ?? undefined },
        )
      }
    } finally {
      setAdding(false)
    }
  }

  // C2.a — Supplement Facts panel (21 CFR 101.36), for DIETARY_SUPPLEMENT.
  async function handleAddSupplement() {
    if (!canvas) return
    setAdding(true)
    try {
      // Phase 2b Step E — REAL supplement data when available; else sample.
      await addSupplementFactsPanel(canvas, nonFoodPanelData?.supplement ?? SAMPLE_SUPPLEMENT_DATA, {
        ink,
        bg,
        border,
        sections,
      })
    } finally {
      setAdding(false)
    }
  }

  // C2.c — AAFCO Guaranteed Analysis panel, for PET_PRODUCT.
  async function handleAddAafco() {
    if (!canvas) return
    setAdding(true)
    try {
      // Phase 2b Step E — REAL pet GA/ingredients when available; else sample.
      await addAafcoPanel(canvas, nonFoodPanelData?.aafco ?? SAMPLE_AAFCO_DATA, {
        ink,
        bg,
        border,
        sections,
        format: selectedFormat ?? undefined,
      })
    } finally {
      setAdding(false)
    }
  }

  // C2.b — Drug Facts panel (21 CFR 201.66), for OTC.
  async function handleAddDrugFacts() {
    if (!canvas) return
    setAdding(true)
    try {
      await addDrugFactsPanel(canvas, SAMPLE_DRUG_FACTS_DATA, { ink, bg, border, sections })
    } finally {
      setAdding(false)
    }
  }

  // Add the facts panel appropriate to this product's labeling type.
  async function handleAddPanel() {
    if (labelingType === 'DIETARY_SUPPLEMENT') return handleAddSupplement()
    if (labelingType === 'PET_PRODUCT') return handleAddAafco()
    if (labelingType === 'OTC') return handleAddDrugFacts()
    return handleAdd()
  }

  // Toggle-off: clicking the button again removes the panel from the artboard.
  function handleRemovePanel() {
    if (!canvas) return
    const obj = canvasRoles.findPanel(panelType)
    if (!obj) return
    canvas.remove(obj)
    canvas.discardActiveObject()
    canvas.requestRenderAll()
  }

  // C4 — pick a format. Records it (applied on next add) and, if the matching
  // facts panel is already on the canvas, re-renders it in place with the new
  // layout. FOOD (Nutrition: Vertical/Tabular/Linear) and PET_PRODUCT (AAFCO:
  // Pet Food/Pet Treat) carry multiple layout formats in V1.
  function handleFormatChange(format: string) {
    setSelectedFormat(format)
    if (!canvas) return
    const obj = canvasRoles.findPanel(panelType)
    if (!obj) return // nothing placed yet — the choice applies on the next add
    const o = obj as unknown as { left?: number; top?: number }
    const centerX = o.left
    const centerY = o.top
    canvas.remove(obj)
    if (panelType === 'nutrition-panel') {
      // Phase 2b — re-add with REAL data + binding so a format change keeps the
      // flavor's nutrition (managed panel), preserving its position.
      void addManagedNutritionPanel(
        canvas,
        nutritionPanelData ?? SAMPLE_NUTRITION_DATA,
        { flavorPresetId: activeFlavorPresetId, recipeHash },
        { ink, bg, border, sections, format, centerX, centerY },
      )
    } else if (panelType === 'aafco-panel') {
      void addAafcoPanel(canvas, nonFoodPanelData?.aafco ?? SAMPLE_AAFCO_DATA, {
        ink,
        bg,
        border,
        sections,
        format,
        centerX,
        centerY,
      })
    } else if (panelType === 'nutrition-aggregate-panel') {
      void addAggregateNutritionPanel(
        canvas,
        aggregateNutritionData ?? {
          flavors: SAMPLE_AGGREGATE_NUTRITION_DATA.flavors.slice(0, flavorCount),
          footnote: SAMPLE_AGGREGATE_NUTRITION_DATA.footnote,
        },
        { ink, bg, border, sections, centerX, centerY },
      )
    }
  }

  // Per-section pre-fill text from product context. Falls back to the
  // generic placeholders baked into addLabelSection.
  function presetTextFor(role: LabelSectionRole): string | undefined {
    if (role === 'statement-of-identity' && productCtx?.productName) {
      return productCtx.productName
    }
    if (role === 'net-weight' && productCtx?.netQuantity) {
      return productCtx.netQuantity
    }
    if (role === 'allergens' && productCtx?.allergens?.length) {
      const list = productCtx.allergens
        .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
        .join(', ')
      return `CONTAINS: ${list}.`
    }
    if (role === 'manufacturer-info' && productCtx?.brandName) {
      return `Manufactured for ${productCtx.brandName}`
    }
    return undefined
  }

  function handleAddSection(role: LabelSectionRole) {
    if (!canvas) return
    addLabelSection(canvas, role, { text: presetTextFor(role) })
  }

  function handleFindSection(role: LabelSectionRole) {
    if (!canvas) return
    const obj = canvasRoles.findByRole(role)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  function handleAddCert(badge: CertBadge) {
    if (!canvas || !badge.badgeUrl) return
    // Delegate to the shell — it gates on consent before anything is placed.
    onRequestAddCert?.(badge)
  }

  function handleFindCert(certInstanceId: string) {
    if (!canvas) return
    const obj = canvasRoles.findCertBadge(certInstanceId)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  return (
    <div className="space-y-5">
      {/* Locked regime banner — the facts panel is fixed by the product's
          labeling type so a Supplement can never show Nutrition Facts. */}
      <div className="flex items-start gap-1.5 rounded-md border border-ink-200 bg-ink-50/60 px-2.5 py-2 text-[12px] leading-[1.45] text-ink-600">
        <Lock className="mt-0.5 h-3 w-3 shrink-0 text-ink-400" />
        <span>
          <b className="text-ink-800">{regimeLabel}</b> product — required panel is{' '}
          <b className="text-ink-800">{panelLabel}</b>, set by the labeling type.
          <InfoTip text="The facts panel is determined by this product's regulatory labeling type (from its category / manufacturer template) — not a manual choice — so the wrong panel can't be shipped (e.g. Nutrition Facts on a supplement). Only the layout Format below is selectable." />
        </span>
      </div>

      {/* Facts panel — branched by labeling type, and a toggle: once it's on the
          artboard, the same button removes it. */}
      {panelOnCanvas ? (
        <button
          type="button"
          onClick={handleRemovePanel}
          disabled={!canvas}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-danger-300 bg-danger-50 text-danger-700 rounded-md hover:bg-danger-100 disabled:opacity-40 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove {panelLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAddPanel}
          disabled={!canvas || adding}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Adding…' : `Add ${panelLabel}`}
        </button>
      )}

      {/* C5 — variety-pack columns (FOOD). >1 → aggregate multi-column panel. */}
      {isFood && (
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
            Variety pack
            <InfoTip text="One package, multiple flavors? Pick how many columns. 2–3 renders an FDA aggregate panel (21 CFR 101.9(h)(4)) — nutrient names once, a value column per flavor. Sample flavors until real per-flavor data binds at print." />
          </div>
          <div className="inline-flex rounded-md border border-ink-200 p-0.5">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setFlavorCount(n)}
                className={
                  'h-7 w-12 rounded text-[12px] font-semibold transition-colors ' +
                  (flavorCount === n
                    ? 'bg-ink-900 text-white'
                    : 'text-ink-600 hover:bg-ink-100')
                }
              >
                {n === 1 ? 'Single' : n}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* C4.b — label format picker (recommended + valid alternatives). */}
      {labelingType && dieCut && (
        <>
          <LabelFormatPicker
            labelingType={labelingType}
            widthMm={dieCut.widthMm}
            heightMm={dieCut.heightMm}
            flavorCount={flavorCount}
            onFormatChange={handleFormatChange}
          />
          <div className="h-px bg-ink-200" />
        </>
      )}

      {/* Required sections — DS-55. */}
      <section>
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700 mb-2">
          Required sections
          <InfoTip text="Tap to drop a pre-tagged text block. The compliance scanner looks for these stamps to confirm each FDA-required section is on your label." />
        </div>
        <div className="space-y-1">
          {(
            [
              'statement-of-identity',
              'net-weight',
              'ingredients',
              'allergens',
              'manufacturer-info',
            ] as LabelSectionRole[]
          ).map((role) => {
            const present = canvasRoles.roles.has(role)
            return (
              <button
                key={role}
                type="button"
                onClick={() =>
                  present ? handleFindSection(role) : handleAddSection(role)
                }
                disabled={!canvas}
                title={
                  present
                    ? 'Already on canvas — click to select'
                    : 'Drop a tagged text block on the canvas'
                }
                className={
                  'w-full flex items-center justify-between gap-2 text-left rounded-md border px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
                  (present
                    ? 'border-success-300 bg-success-50/50 hover:bg-success-50'
                    : 'border-ink-200 hover:border-pink-500 hover:bg-pink-50/40')
                }
              >
                <span className="flex items-center gap-1.5">
                  {present && (
                    <Check className="h-3 w-3 text-success-700 flex-shrink-0" />
                  )}
                  <span
                    className={
                      'text-[12.5px] font-semibold ' +
                      (present ? 'text-success-900' : 'text-ink-900')
                    }
                  >
                    {LABEL_SECTION_LABELS[role]}
                  </span>
                </span>
                {present ? (
                  <Target className="h-3.5 w-3.5 text-success-700" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-ink-500" />
                )}
              </button>
            )
          })}
        </div>
      </section>

      <div className="h-px bg-ink-200" />

      {/* Certifications — earned certs, dropped as print badges (Phase 3). */}
      <section>
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700 mb-2">
          Certifications
          <InfoTip text="Certs your product has earned. Tap to drop the print badge — it lands in the bottom safe area, then you can move it anywhere." />
        </div>
        {certBadges.length === 0 ? (
          <p className="text-[11px] text-ink-400 italic leading-[1.45]">
            None yet. Certifications a partner has verified for this product
            appear here automatically.
          </p>
        ) : (
          <div className="space-y-1">
            {certBadges.map((badge) => {
              const present = canvasRoles.certBadgeIds.has(badge.certInstanceId)
              const noArt = !badge.badgeUrl
              return (
                <button
                  key={badge.certInstanceId}
                  type="button"
                  onClick={() =>
                    present
                      ? handleFindCert(badge.certInstanceId)
                      : handleAddCert(badge)
                  }
                  disabled={!canvas || (!present && noArt)}
                  title={
                    noArt
                      ? 'No badge art uploaded for this certification yet'
                      : present
                        ? 'On canvas — click to select'
                        : 'Drop the print badge on the canvas'
                  }
                  className={
                    'w-full flex items-center justify-between gap-2 text-left rounded-md border px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
                    (present
                      ? 'border-success-300 bg-success-50/50 hover:bg-success-50'
                      : 'border-ink-200 hover:border-pink-500 hover:bg-pink-50/40')
                  }
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {badge.badgeUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={badge.badgeUrl}
                        alt=""
                        className="h-6 w-6 flex-shrink-0 rounded border border-ink-200 bg-white object-contain p-0.5"
                      />
                    ) : (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border border-ink-200 bg-ink-50">
                        <ShieldCheck className="h-3.5 w-3.5 text-ink-400" />
                      </span>
                    )}
                    <span
                      className={
                        'text-[12.5px] font-semibold truncate ' +
                        (present ? 'text-success-900' : 'text-ink-900')
                      }
                    >
                      {badge.certTypeName}
                    </span>
                  </span>
                  {present ? (
                    <Target className="h-3.5 w-3.5 flex-shrink-0 text-success-700" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 flex-shrink-0 text-ink-500" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="h-px bg-ink-200" />

      {/* Layout style, Ink/Background, Border, and Width all live on the panel's
          own toolbar (and the format picker above) — not duplicated in the drawer. */}

      {/* C3.b — per-section visibility toggles, applied when the panel is added. */}
      <section>
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700 mb-2">
          Panel sections
          <InfoTip text="Applied when you add the panel. Hiding required sections may flag in the compliance scan." />
        </div>
        <div className="space-y-1.5">
          <Checkbox
            checked={showTitle}
            onChange={(e) => setShowTitle(e.target.checked)}
            label="Show panel title"
            className="text-[12px] text-ink-800"
          />
          <Checkbox
            checked={showFootnote}
            onChange={(e) => setShowFootnote(e.target.checked)}
            label="Show footnote / disclosure"
            className="text-[12px] text-ink-800"
          />
        </div>
      </section>

      {/* C6 — nutrient-content claim suggestions (FOOD only; maps to the
          Nutrition Facts dataset). */}
      {(!labelingType || labelingType === 'FOOD') && (
        <>
          <div className="h-px bg-ink-200" />
          <ClaimSuggestions canvas={canvas} data={SAMPLE_NUTRITION_DATA} />
        </>
      )}

    </div>
  )
}


