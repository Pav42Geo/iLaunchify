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
import { Plus, Tag, Check, Target } from 'lucide-react'
import {
  addNutritionFactsPanel,
  addLabelSection,
  LABEL_SECTION_LABELS,
  SAMPLE_NUTRITION_DATA,
  type BrandCanvasAssets,
  type FabricCanvas,
  type LabelSectionRole,
} from '@ilaunchify/ui'
import { useCanvasRoles } from '../useCanvasRoles'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
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

type StyleKey = 'standard' | 'tabular'

export function LabelDrawer({ canvas, brandAssets, productCtx }: Props) {
  const canvasRoles = useCanvasRoles(canvas)

  const [style, setStyle] = React.useState<StyleKey>('standard')
  const [ink, setInk] = React.useState('#000000')
  /** null sentinel for transparent. */
  const [bg, setBg] = React.useState<string | null>('#FFFFFF')
  const [border, setBorder] = React.useState(true)
  const [width, setWidth] = React.useState(220)
  const [adding, setAdding] = React.useState(false)

  // Brand swatches (deduped) for the quick-pick row in color sections.
  const brandSwatches = Array.from(
    new Set(
      [
        brandAssets.colorPrimary,
        brandAssets.colorSecondary,
        brandAssets.colorAccent,
        ...brandAssets.extraSwatches,
      ].filter((c): c is string => Boolean(c)),
    ),
  )

  async function handleAdd() {
    if (!canvas) return
    setAdding(true)
    try {
      await addNutritionFactsPanel(canvas, SAMPLE_NUTRITION_DATA, {
        style,
        ink,
        bg,
        border,
        widthPx: width,
      })
    } finally {
      setAdding(false)
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

  function handleFindNutritionPanel() {
    if (!canvas) return
    const obj = canvasRoles.findNutritionPanel()
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  return (
    <div className="space-y-5">
      {/* Required sections — DS-55. */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Required sections
        </div>
        <p className="text-[11px] text-ink-500 mb-2.5 leading-[1.45]">
          Tap to drop a pre-tagged text block. The compliance scanner
          looks for these stamps to confirm each FDA-required section
          is on your label.
        </p>
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

      {/* Style */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Layout style
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <StyleTile
            active={style === 'standard'}
            label="Standard"
            hint="Vertical · most common"
            onClick={() => setStyle('standard')}
          />
          <StyleTile
            active={style === 'tabular'}
            label="Tabular"
            hint="Side-by-side · V2"
            onClick={() => setStyle('tabular')}
            disabled
          />
        </div>
      </section>

      {/* Ink color */}
      <ColorRow
        label="Ink color"
        value={ink}
        onChange={setInk}
        brandSwatches={brandSwatches}
      />

      {/* Background color (with transparent option) */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Background
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setBg(null)}
            aria-pressed={bg === null}
            className={
              'h-9 px-3 rounded-md border text-[12px] font-semibold transition-colors relative overflow-hidden ' +
              (bg === null
                ? 'border-pink-500 bg-pink-50 text-pink-700 ring-2 ring-pink-500/20'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-500')
            }
            style={{
              backgroundImage:
                bg === null
                  ? undefined
                  : 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)',
              backgroundSize: '12px 12px',
            }}
          >
            <span className="relative bg-white/80 px-1 rounded">Transparent</span>
          </button>
          {bg !== null && (
            <>
              <label className="relative w-9 h-9 rounded-md border border-ink-300 overflow-hidden cursor-pointer flex-shrink-0">
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="absolute inset-1 rounded" style={{ backgroundColor: bg }} />
              </label>
              <input
                type="text"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="flex-1 h-9 px-2 text-[12px] font-mono tabular-nums border border-ink-300 rounded-md focus:outline-none focus:border-pink-500"
              />
            </>
          )}
          {bg === null && (
            <button
              type="button"
              onClick={() => setBg('#FFFFFF')}
              className="h-9 px-3 text-[12px] font-semibold text-ink-700 hover:text-ink-900 hover:bg-ink-100 rounded-md transition-colors"
            >
              Set color →
            </button>
          )}
        </div>
        {bg !== null && brandSwatches.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-pink-700 font-semibold mr-1">
              Brand
            </span>
            {brandSwatches.slice(0, 5).map((hex) => {
              const active = hex.toUpperCase() === (bg ?? '').toUpperCase()
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setBg(hex)}
                  title={hex}
                  className={
                    'h-6 w-6 rounded border transition-all ' +
                    (active
                      ? 'border-pink-500 ring-2 ring-pink-500/20 scale-105'
                      : 'border-ink-200 hover:border-ink-400')
                  }
                  style={{ backgroundColor: hex }}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Border */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Border
        </div>
        <label className="flex items-center gap-2.5 text-[13px] cursor-pointer">
          <button
            type="button"
            onClick={() => setBorder((v) => !v)}
            aria-pressed={border}
            className={
              'w-4 h-4 border-[1.5px] rounded relative flex-shrink-0 transition-colors ' +
              (border ? 'bg-pink-500 border-pink-500' : 'border-ink-300 hover:border-ink-500')
            }
          >
            {border && (
              <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] font-bold">
                ✓
              </span>
            )}
          </button>
          <span className="text-ink-700">Draw outer border (1px in ink color)</span>
        </label>
      </section>

      {/* Width slider */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Width
          </div>
          <span className="text-[11px] font-mono tabular-nums text-ink-600">
            {width}px
          </span>
        </div>
        <input
          type="range"
          min={160}
          max={360}
          step={4}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          className="w-full accent-pink-500"
        />
        <p className="mt-1.5 text-[11px] text-ink-500">
          Fit the panel to your label's available space — narrower for small
          bottles, wider for boxes.
        </p>
      </section>

      {/* Add Nutrition Facts — converts to "Find on canvas" when one is present
          to prevent duplicates (21 CFR 101.9 — one panel per package). */}
      {canvasRoles.nutritionPanelPresent ? (
        <button
          type="button"
          onClick={handleFindNutritionPanel}
          disabled={!canvas}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-emerald-300 bg-emerald-50 text-emerald-900 rounded-md hover:bg-emerald-100 disabled:opacity-40 transition-colors"
        >
          <Target className="h-3.5 w-3.5" />
          Nutrition Facts on canvas — click to select
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canvas || adding}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {adding ? 'Adding…' : 'Add Nutrition Facts'}
        </button>
      )}

      {/* Disclosure */}
      <section className="rounded-md border border-pink-200 bg-pink-50/60 p-3">
        <div className="flex gap-2.5">
          <Tag strokeWidth={2.5} className="h-3.5 w-3.5 text-pink-700 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">
              Sample values · real data at print
            </div>
            <p className="mt-1 text-[11px] text-ink-700 leading-[1.45]">
              The panel ships with placeholder nutrient values for layout. Real
              per-product values bind to the panel at print / export time from
              your linked Recipe via the compliance service. Drag the panel
              into the safe area to lock its position.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StyleTile({
  active,
  label,
  hint,
  onClick,
  disabled,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        'text-left rounded-md border p-3 transition-all ' +
        (disabled
          ? 'border-ink-200 bg-ink-50 opacity-60 cursor-not-allowed'
          : active
            ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-500/20'
            : 'border-ink-200 bg-white hover:border-ink-400')
      }
    >
      <div className="font-bold text-[13px] text-ink-900">{label}</div>
      <div className="text-[10.5px] text-ink-500 mt-0.5">{hint}</div>
    </button>
  )
}

function ColorRow({
  label,
  value,
  onChange,
  brandSwatches,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  brandSwatches: string[]
}) {
  return (
    <section>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <label className="relative w-9 h-9 rounded-md border border-ink-300 overflow-hidden cursor-pointer flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <span className="absolute inset-1 rounded" style={{ backgroundColor: value }} />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-9 px-2 text-[12px] font-mono tabular-nums border border-ink-300 rounded-md focus:outline-none focus:border-pink-500"
        />
      </div>
      {brandSwatches.length > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-pink-700 font-semibold mr-1">
            Brand
          </span>
          {brandSwatches.slice(0, 5).map((hex) => {
            const active = hex.toUpperCase() === value.toUpperCase()
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                title={hex}
                className={
                  'h-6 w-6 rounded border transition-all ' +
                  (active
                    ? 'border-pink-500 ring-2 ring-pink-500/20 scale-105'
                    : 'border-ink-200 hover:border-ink-400')
                }
                style={{ backgroundColor: hex }}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
