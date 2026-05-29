'use client'

// NutritionFactsToolbar — floating editor that appears at the top of the
// canvas when a nutrition-panel Group is selected (DS-53b).
//
// UX pattern matches TextFormatToolbar: drawers add new things, toolbars
// edit selected things. Controls: background (with Transparent), ink
// color (text + rules), outer border toggle, deselect.

import * as React from 'react'
import { X, Square, Lock, Eye } from 'lucide-react'
import {
  updateNutritionPanel,
  readNutritionPanelProps,
  NUTRITION_FACTS_MIN_SCALE,
  type BrandCanvasAssets,
  type FabricCanvas,
  type FabricObject,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
  brandAssets: BrandCanvasAssets
}

const STAPLE_BG = ['#FFFFFF', '#FAF7F0', '#F4F1EA', '#0F1116']
const STAPLE_INK = ['#000000', '#FFFFFF', '#33343C', '#FF2E63']

export function NutritionFactsToolbar({ canvas, active, brandAssets }: Props) {
  // Initial hydration from the selected group's existing tagged children.
  const initial = React.useMemo(() => readNutritionPanelProps(active), [active])

  // Live scale of the NFR group — driven by the width slider below.
  // Reading scaleX off the fabric group, falling back to 1. Bumps when
  // the user drags scale handles too, so the slider stays in sync.
  const groupAccess = active as unknown as {
    scaleX?: number
    scaleY?: number
    set: (k: string | object, v?: unknown) => void
  }
  const [scale, setScale] = React.useState(groupAccess.scaleX ?? 1)
  React.useEffect(() => {
    function refresh() {
      setScale(groupAccess.scaleX ?? 1)
    }
    refresh()
    if (!canvas) return
    canvas.on('object:scaling', refresh)
    canvas.on('object:modified', refresh)
    return () => {
      canvas.off('object:scaling', refresh)
      canvas.off('object:modified', refresh)
    }
  }, [canvas, groupAccess])

  function applyScale(next: number) {
    if (!canvas) return
    const clamped = Math.max(NUTRITION_FACTS_MIN_SCALE, Math.min(3, next))
    setScale(clamped)
    groupAccess.set({ scaleX: clamped, scaleY: clamped })
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
  }

  const atMinScale = scale <= NUTRITION_FACTS_MIN_SCALE + 0.001
  const scalePct = Math.round(scale * 100)

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

  function patch(props: { bg?: string | null; ink?: string; border?: boolean }) {
    if (!canvas) return
    updateNutritionPanel(canvas, active, props)
  }

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 shadow-lg">
        {/* Background */}
        <ColorTrigger
          label="Background"
          value={initial.bg}
          allowTransparent
          brandSwatches={brandSwatches}
          staples={STAPLE_BG}
          onChange={(v) => patch({ bg: v })}
        />

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Ink */}
        <ColorTrigger
          label="Ink"
          value={initial.ink}
          brandSwatches={brandSwatches}
          staples={STAPLE_INK}
          onChange={(v) => patch({ ink: v ?? '#000000' })}
        />

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Width — live scales the NFR group. Floor enforced by
            NUTRITION_FACTS_MIN_SCALE so the "Nutrition Facts" title
            stays ≥ 13pt per 21 CFR 101.9(d)(1)(i)(B). */}
        <div className="flex items-center gap-1.5 px-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            W
          </span>
          <input
            type="range"
            min={NUTRITION_FACTS_MIN_SCALE * 100}
            max={300}
            step={5}
            value={Math.round(scale * 100)}
            onChange={(e) => applyScale(Number(e.target.value) / 100)}
            className="w-20 accent-pink-500"
            aria-label="Panel width"
            title={
              atMinScale
                ? '"Nutrition Facts" title must be ≥ 13pt (21 CFR 101.9(d))'
                : 'Resize panel'
            }
          />
          <span className="text-[11px] font-mono tabular-nums text-ink-700 min-w-[32px] text-right">
            {scalePct}%
          </span>
          {atMinScale && (
            <Lock className="h-3 w-3 text-pink-600" aria-label="FDA minimum size" />
          )}
        </div>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Border toggle */}
        <button
          type="button"
          aria-pressed={initial.border}
          aria-label="Toggle border"
          title={initial.border ? 'Remove border' : 'Add border'}
          onClick={() => patch({ border: !initial.border })}
          className={
            'rounded p-1.5 transition-colors flex items-center gap-1 ' +
            (initial.border
              ? 'bg-ink-900 text-white hover:bg-black'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
          }
        >
          <Square strokeWidth={2} className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold">Border</span>
        </button>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Close */}
        <button
          type="button"
          aria-label="Deselect"
          onClick={() => {
            if (!canvas) return
            canvas.discardActiveObject()
            canvas.requestRenderAll()
          }}
          className="rounded p-1.5 text-ink-500 hover:text-ink-900 hover:bg-ink-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-controls
// ============================================================================

function ColorTrigger({
  label,
  value,
  allowTransparent,
  brandSwatches,
  staples,
  onChange,
}: {
  label: string
  value: string | null
  allowTransparent?: boolean
  brandSwatches: string[]
  staples: string[]
  onChange: (v: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isTransparent = value === null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        className="h-7 px-1.5 rounded border border-ink-200 hover:border-ink-400 transition-colors flex items-center gap-1.5"
      >
        <span
          className="block w-5 h-5 rounded overflow-hidden border border-ink-200"
          style={
            isTransparent
              ? {
                  backgroundImage:
                    'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)',
                  backgroundSize: '8px 8px',
                }
              : { backgroundColor: value ?? '#000' }
          }
        />
        <span className="text-[11px] font-semibold text-ink-700 pr-0.5">
          {label}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30">
          {allowTransparent && (
            <>
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className={
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] font-semibold transition-colors mb-2 ' +
                  (isTransparent
                    ? 'bg-pink-50 text-pink-700 ring-2 ring-pink-500/20'
                    : 'text-ink-700 hover:bg-ink-50')
                }
              >
                <Eye className="h-3 w-3" />
                Transparent
              </button>
              <div className="border-t border-ink-100 mb-2" />
            </>
          )}
          {brandSwatches.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 mb-1.5">
                Brand
              </div>
              <SwatchRow
                swatches={brandSwatches}
                current={value ?? ''}
                onPick={(v) => {
                  onChange(v)
                  setOpen(false)
                }}
              />
              <div className="my-2.5 border-t border-ink-100" />
            </>
          )}
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
            Staples
          </div>
          <SwatchRow
            swatches={staples}
            current={value ?? ''}
            onPick={(v) => {
              onChange(v)
              setOpen(false)
            }}
          />
          <div className="mt-3 flex items-center gap-2">
            <label className="relative w-7 h-7 rounded border border-ink-200 overflow-hidden cursor-pointer flex-shrink-0">
              <input
                type="color"
                value={value && value.length === 7 ? value : '#000000'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              />
              <span
                className="absolute inset-0"
                style={{ backgroundColor: value ?? '#000' }}
              />
            </label>
            <input
              type="text"
              value={value ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                  if (v.length === 7) onChange(v)
                }
              }}
              spellCheck={false}
              placeholder="#000000"
              className="flex-1 h-7 px-2 text-[12px] font-mono tabular-nums border border-ink-200 rounded focus:outline-none focus:border-pink-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SwatchRow({
  swatches,
  current,
  onPick,
}: {
  swatches: string[]
  current: string
  onPick: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {swatches.map((hex) => {
        const active = hex.toUpperCase() === current.toUpperCase()
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onPick(hex)}
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
  )
}
