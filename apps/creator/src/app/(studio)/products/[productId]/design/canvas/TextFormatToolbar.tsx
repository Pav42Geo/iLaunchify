'use client'

// TextFormatToolbar — floating chrome at top of canvas that appears when a
// text object (IText / Text / Textbox) is selected.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.5:
//   - Font family dropdown (brand fonts pinned to top)
//   - Size input
//   - Color picker (brand swatches pinned to top)
//   - Bold / Italic / Underline toggles
//   - Alignment: left / center / right
//   - Close (deselects)

import * as React from 'react'
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  X,
  Lock,
} from 'lucide-react'
import {
  LABEL_SECTION_MIN_FONT_SIZE,
  LABEL_SECTION_CITATIONS,
  LABEL_SECTION_LABELS,
  type BrandCanvasAssets,
  type FabricCanvas,
  type FabricObject,
  type LabelSectionRole,
} from '@ilaunchify/ui'
import { FontPicker } from './FontPicker'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
  brandAssets: BrandCanvasAssets
  /** Open the rich font drawer (DS-66f). The toolbar's font field
   *  triggers this; the parent shell mounts TextFontDrawer in the
   *  left rail slot when toggled on. */
  onOpenFontDrawer?: () => void
}

export function TextFormatToolbar({
  canvas,
  active,
  brandAssets,
  onOpenFontDrawer,
}: Props) {
  // Cast to a loose shape — fabric IText/Text/Textbox share these.
  const text = active as unknown as {
    fontFamily?: string
    fontSize?: number
    fontWeight?: number | string
    fontStyle?: string
    underline?: boolean
    textAlign?: string
    fill?: string
    set: (k: string | object, v?: unknown) => void
  }

  const fontFamily = text.fontFamily ?? 'Inter'
  const fontSize = Math.round(text.fontSize ?? 24)
  const fontWeight = String(text.fontWeight ?? '400')

  // DS-58d — when the selected text is a tagged required-label section,
  // its font size is bound by the FDA minimum for that role (see
  // packages/ui canvas/labelRules.ts). Drives SizeControl's lower bound
  // + shows the lock affordance.
  const labelRole = (active as { customRole?: LabelSectionRole }).customRole ?? null
  const fdaMinSize =
    labelRole != null ? LABEL_SECTION_MIN_FONT_SIZE[labelRole] : null
  const fdaTooltip =
    labelRole != null
      ? `${LABEL_SECTION_LABELS[labelRole]} must be ≥ ${fdaMinSize}pt (${LABEL_SECTION_CITATIONS[labelRole]})`
      : undefined
  const isBold = fontWeight === 'bold' || Number(fontWeight) >= 600
  const isItalic = text.fontStyle === 'italic'
  const isUnderline = !!text.underline
  const textAlign = text.textAlign ?? 'left'
  const fill = text.fill ?? '#0F1116'

  function commit(props: Record<string, unknown>) {
    if (!canvas) return
    text.set(props)
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
  }

  const brandFontNames = brandAssets.fonts.map((f) => f.family)
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

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 shadow-lg">
        {/* Font family — DS-66f Canva-style. The trigger button opens
            the full TextFontDrawer in the left rail; the shell owns the
            drawer-open state so it can replace whichever rail drawer
            is currently mounted. */}
        <FontPicker
          value={fontFamily}
          onClick={() => onOpenFontDrawer?.()}
        />

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Size — clamped to FDA minimum when this text is a tagged
            required-label section (DS-58d). */}
        <SizeControl
          value={fontSize}
          onChange={(v) => commit({ fontSize: v })}
          minSize={fdaMinSize ?? 4}
          minSizeReason={fdaTooltip}
        />

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Color */}
        <ColorControl
          value={fill}
          brandSwatches={brandSwatches}
          onChange={(v) => commit({ fill: v })}
        />

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Bold / Italic / Underline */}
        <ToggleButton
          ariaLabel="Bold"
          active={isBold}
          onClick={() => commit({ fontWeight: isBold ? '400' : 'bold' })}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          ariaLabel="Italic"
          active={isItalic}
          onClick={() => commit({ fontStyle: isItalic ? 'normal' : 'italic' })}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          ariaLabel="Underline"
          active={isUnderline}
          onClick={() => commit({ underline: !isUnderline })}
        >
          <Underline className="h-3.5 w-3.5" />
        </ToggleButton>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Alignment */}
        <ToggleButton
          ariaLabel="Align left"
          active={textAlign === 'left'}
          onClick={() => commit({ textAlign: 'left' })}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          ariaLabel="Align center"
          active={textAlign === 'center'}
          onClick={() => commit({ textAlign: 'center' })}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToggleButton>
        <ToggleButton
          ariaLabel="Align right"
          active={textAlign === 'right'}
          onClick={() => commit({ textAlign: 'right' })}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToggleButton>

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

// FontDropdown + FontRow removed in DS-66 — replaced by the dedicated
// FontPicker component (./FontPicker.tsx) which surfaces the full Bunny
// Fonts catalog with search + categories + lazy load.

function SizeControl({
  value,
  onChange,
  minSize,
  minSizeReason,
}: {
  value: number
  onChange: (n: number) => void
  /** Floor for font-size — never goes below this. Default 4. */
  minSize: number
  /** Tooltip text explaining the floor (e.g., FDA citation). */
  minSizeReason?: string
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => {
    setText(String(value))
  }, [value])
  const atMin = value <= minSize
  function commit() {
    const n = parseInt(text, 10)
    if (Number.isFinite(n) && n > 0) onChange(Math.min(400, Math.max(minSize, n)))
    else setText(String(value))
  }
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Decrease size"
        title={atMin && minSizeReason ? minSizeReason : undefined}
        disabled={atMin}
        onClick={() => onChange(Math.max(minSize, value - 1))}
        className={
          'rounded p-1 transition-colors ' +
          (atMin
            ? 'text-ink-300 cursor-not-allowed'
            : 'text-ink-500 hover:text-ink-900 hover:bg-ink-100')
        }
      >
        −
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        title={minSizeReason}
        className="w-10 h-7 text-[12.5px] font-mono tabular-nums text-center text-ink-900 border border-ink-200 rounded focus:outline-none focus:border-pink-500"
      />
      <button
        type="button"
        aria-label="Increase size"
        onClick={() => onChange(Math.min(400, value + 1))}
        className="rounded p-1 text-ink-500 hover:text-ink-900 hover:bg-ink-100"
      >
        +
      </button>
      {atMin && minSizeReason && (
        <span
          title={minSizeReason}
          className="ml-0.5 inline-flex items-center"
          aria-label={minSizeReason}
        >
          <Lock className="h-3 w-3 text-pink-600" />
        </span>
      )}
    </div>
  )
}

function ColorControl({
  value,
  brandSwatches,
  onChange,
}: {
  value: string
  brandSwatches: string[]
  onChange: (v: string) => void
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Text color"
        className="h-7 w-7 rounded border border-ink-200 hover:border-ink-400 transition-colors overflow-hidden"
      >
        <span className="block w-full h-full" style={{ backgroundColor: value }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30">
          {brandSwatches.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 mb-1.5">
                Brand colors
              </div>
              <SwatchRow
                swatches={brandSwatches}
                current={value}
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
            swatches={[
              '#0F1116',
              '#FFFFFF',
              '#FF2E63',
              '#B5FF3D',
              '#6B6D78',
              '#FAF7F0',
            ]}
            current={value}
            onPick={(v) => {
              onChange(v)
              setOpen(false)
            }}
          />
          <div className="mt-3 flex items-center gap-2">
            <label className="relative w-7 h-7 rounded border border-ink-200 overflow-hidden cursor-pointer flex-shrink-0">
              <input
                type="color"
                value={value.length === 7 ? value : '#000000'}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
              />
              <span
                className="absolute inset-0"
                style={{ backgroundColor: value }}
              />
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => {
                const v = e.target.value
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                  if (v.length === 7) onChange(v)
                  // Allow partial input while typing — only commit on full hex.
                }
              }}
              spellCheck={false}
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

function ToggleButton({
  active,
  ariaLabel,
  onClick,
  children,
}: {
  active: boolean
  ariaLabel: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={
        'rounded p-1.5 transition-colors ' +
        (active
          ? 'bg-ink-900 text-white hover:bg-black'
          : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
      }
    >
      {children}
    </button>
  )
}
