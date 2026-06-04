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
import { Plus, Check, Target, ShieldCheck, Trash2 } from 'lucide-react'
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
  LABEL_SECTION_LABELS,
  SAMPLE_NUTRITION_DATA,
  type BrandCanvasAssets,
  type CanvasCustomType,
  type DieCutSpec,
  type FabricCanvas,
  type LabelSectionRole,
} from '@ilaunchify/ui'
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
}


export function LabelDrawer({
  canvas,
  brandAssets,
  certBadges = [],
  onRequestAddCert,
  labelingType,
  dieCut,
  productCtx,
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

  async function handleAdd() {
    if (!canvas) return
    setAdding(true)
    try {
      if (aggregate) {
        await addAggregateNutritionPanel(
          canvas,
          {
            flavors: SAMPLE_AGGREGATE_NUTRITION_DATA.flavors.slice(0, flavorCount),
            footnote: SAMPLE_AGGREGATE_NUTRITION_DATA.footnote,
          },
          { ink, bg, border, sections },
        )
      } else {
        await addNutritionFactsPanel(canvas, SAMPLE_NUTRITION_DATA, {
          ink,
          bg,
          border,
          sections,
          format: selectedFormat ?? undefined,
        })
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
      await addSupplementFactsPanel(canvas, SAMPLE_SUPPLEMENT_DATA, {
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
      await addAafcoPanel(canvas, SAMPLE_AAFCO_DATA, {
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
      void addNutritionFactsPanel(canvas, SAMPLE_NUTRITION_DATA, {
        ink,
        bg,
        border,
        sections,
        format,
        centerX,
        centerY,
      })
    } else if (panelType === 'aafco-panel') {
      void addAafcoPanel(canvas, SAMPLE_AAFCO_DATA, {
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
        {
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
      {/* Facts panel — branched by labeling type, and a toggle: once it's on the
          artboard, the same button removes it. */}
      {panelOnCanvas ? (
        <button
          type="button"
          onClick={handleRemovePanel}
          disabled={!canvas}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-rose-300 bg-rose-50 text-rose-700 rounded-md hover:bg-rose-100 disabled:opacity-40 transition-colors"
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
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
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
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
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
                    ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
                    : 'border-ink-200 hover:border-pink-500 hover:bg-pink-50/40')
                }
              >
                <span className="flex items-center gap-1.5">
                  {present && (
                    <Check className="h-3 w-3 text-emerald-700 flex-shrink-0" />
                  )}
                  <span
                    className={
                      'text-[12.5px] font-semibold ' +
                      (present ? 'text-emerald-900' : 'text-ink-900')
                    }
                  >
                    {LABEL_SECTION_LABELS[role]}
                  </span>
                </span>
                {present ? (
                  <Target className="h-3.5 w-3.5 text-emerald-700" />
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
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
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
                      ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
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
                        (present ? 'text-emerald-900' : 'text-ink-900')
                      }
                    >
                      {badge.certTypeName}
                    </span>
                  </span>
                  {present ? (
                    <Target className="h-3.5 w-3.5 flex-shrink-0 text-emerald-700" />
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
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Panel sections
          <InfoTip text="Applied when you add the panel. Hiding required sections may flag in the compliance scan." />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-[12px] text-ink-800">
            <input
              type="checkbox"
              checked={showTitle}
              onChange={(e) => setShowTitle(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
            />
            Show panel title
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-800">
            <input
              type="checkbox"
              checked={showFootnote}
              onChange={(e) => setShowFootnote(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
            />
            Show footnote / disclosure
          </label>
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


