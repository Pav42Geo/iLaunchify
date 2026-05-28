'use client'

// CodeToolbar — floating editor for QR / Barcode / Internal-SKU image
// objects (DS-54). Replaces ImageToolbar when the selected image is a
// code, so creators can edit the encoded content without going back to
// the drawer.
//
// Each kind exposes the right fields:
//   - QR:           text + fg color + bg color
//   - Barcode:      text + format dropdown
//   - Internal-SKU: SKU input
// Plus the shared image affordances: opacity slider, flip H/V, close.
//
// regenerateCodeImage from packages/ui swaps the fabric.Image's bitmap
// in place, preserving position / scale / rotation. customData
// round-trips through autosave so reload re-hydrates the toolbar.

import * as React from 'react'
import {
  X,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
} from 'lucide-react'
import {
  regenerateCodeImage,
  BARCODE_FORMATS,
  type BarcodeFormat,
  type CodeCustomData,
  type FabricCanvas,
  type FabricObject,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
}

export function CodeToolbar({ canvas, active }: Props) {
  // Pull the typed payload off the object. If somehow missing (legacy
  // pre-DS-54 objects), the toolbar still renders the shared opacity /
  // flip controls but the kind-specific fields stay empty.
  const data = (active as { customData?: CodeCustomData }).customData ?? null
  const obj = active as unknown as {
    opacity?: number
    flipX?: boolean
    flipY?: boolean
    set: (k: string | object, v?: unknown) => void
  }

  const opacity = Math.round((obj.opacity ?? 1) * 100)
  const flipX = !!obj.flipX
  const flipY = !!obj.flipY

  const [regenerating, setRegenerating] = React.useState(false)

  function commit(props: Record<string, unknown>) {
    if (!canvas) return
    obj.set(props)
    canvas.fire('object:modified', { target: active })
    canvas.requestRenderAll()
  }

  async function regen(next: CodeCustomData) {
    if (!canvas) return
    setRegenerating(true)
    try {
      await regenerateCodeImage(canvas, active, next)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 shadow-lg max-w-[680px]">
        {/* Kind-specific fields */}
        {data?.kind === 'qr' && (
          <QrFields data={data} onChange={regen} busy={regenerating} />
        )}
        {data?.kind === 'barcode' && (
          <BarcodeFields data={data} onChange={regen} busy={regenerating} />
        )}
        {data?.kind === 'internal-sku' && (
          <InternalSkuFields data={data} onChange={regen} busy={regenerating} />
        )}
        {!data && (
          <span className="text-[11px] text-ink-500 px-1.5">
            Editable fields unavailable for this code
          </span>
        )}

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Shared: opacity */}
        <div className="flex items-center gap-1.5 px-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Op
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => commit({ opacity: Number(e.target.value) / 100 })}
            className="w-16 accent-pink-500"
            aria-label="Opacity"
          />
          <span className="text-[11px] font-mono tabular-nums text-ink-700 min-w-[28px] text-right">
            {opacity}%
          </span>
        </div>

        <div className="mx-0.5 h-5 w-px bg-ink-200" />

        {/* Shared: flips */}
        <button
          type="button"
          aria-pressed={flipX}
          aria-label="Flip horizontal"
          onClick={() => commit({ flipX: !flipX })}
          className={
            'rounded p-1.5 transition-colors ' +
            (flipX
              ? 'bg-ink-900 text-white hover:bg-black'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
          }
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-pressed={flipY}
          aria-label="Flip vertical"
          onClick={() => commit({ flipY: !flipY })}
          className={
            'rounded p-1.5 transition-colors ' +
            (flipY
              ? 'bg-ink-900 text-white hover:bg-black'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900')
          }
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
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
// QR fields
// ============================================================================

function QrFields({
  data,
  onChange,
  busy,
}: {
  data: Extract<CodeCustomData, { kind: 'qr' }>
  onChange: (d: CodeCustomData) => void
  busy: boolean
}) {
  const [text, setText] = React.useState(data.text)
  React.useEffect(() => setText(data.text), [data.text])

  return (
    <>
      <DebouncedTextInput
        value={text}
        onChange={setText}
        onCommit={(v) => onChange({ ...data, text: v })}
        placeholder="URL or text"
        width={180}
        busy={busy}
      />
      <ColorChip
        label="FG"
        value={data.dark}
        onChange={(c) => onChange({ ...data, dark: c })}
      />
      <ColorChip
        label="BG"
        value={data.light}
        onChange={(c) => onChange({ ...data, light: c })}
      />
    </>
  )
}

// ============================================================================
// Barcode fields
// ============================================================================

function BarcodeFields({
  data,
  onChange,
  busy,
}: {
  data: Extract<CodeCustomData, { kind: 'barcode' }>
  onChange: (d: CodeCustomData) => void
  busy: boolean
}) {
  const [text, setText] = React.useState(data.text)
  React.useEffect(() => setText(data.text), [data.text])
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

  const active = BARCODE_FORMATS.find((f) => f.value === data.format)

  return (
    <>
      <DebouncedTextInput
        value={text}
        onChange={setText}
        onCommit={(v) => onChange({ ...data, text: v })}
        placeholder="Data"
        width={160}
        mono
        busy={busy}
      />
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-7 px-2 rounded border border-ink-200 hover:border-ink-400 text-[11.5px] font-semibold text-ink-900 flex items-center gap-1"
        >
          {active?.label ?? data.format}
          <RotateCw className="h-3 w-3 text-ink-500" />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 w-44 bg-white border border-ink-200 rounded-lg shadow-xl py-1.5 z-30">
            {BARCODE_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  onChange({ ...data, format: f.value as BarcodeFormat })
                  setOpen(false)
                }}
                className={
                  'w-full text-left px-3 py-1.5 text-[12.5px] transition-colors ' +
                  (f.value === data.format
                    ? 'bg-pink-50 text-pink-700 font-semibold'
                    : 'text-ink-700 hover:bg-ink-50')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ============================================================================
// Internal-SKU fields
// ============================================================================

function InternalSkuFields({
  data,
  onChange,
  busy,
}: {
  data: Extract<CodeCustomData, { kind: 'internal-sku' }>
  onChange: (d: CodeCustomData) => void
  busy: boolean
}) {
  const [sku, setSku] = React.useState(data.sku)
  React.useEffect(() => setSku(data.sku), [data.sku])

  return (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 px-1">
        SKU
      </span>
      <DebouncedTextInput
        value={sku}
        onChange={(v) => setSku(v.toUpperCase())}
        onCommit={(v) => onChange({ ...data, sku: v.toUpperCase() })}
        placeholder="KINDRED-VAN-30CT"
        width={200}
        mono
        busy={busy}
      />
    </>
  )
}

// ============================================================================
// Shared subcontrols
// ============================================================================

function DebouncedTextInput({
  value,
  onChange,
  onCommit,
  placeholder,
  width,
  mono,
  busy,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: (v: string) => void
  placeholder: string
  width: number
  mono?: boolean
  busy?: boolean
}) {
  // Commit on blur or Enter — avoids regenerating on every keystroke.
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      placeholder={placeholder}
      spellCheck={false}
      style={{ width }}
      className={
        'h-7 px-2 text-[12px] border border-ink-200 rounded focus:outline-none focus:border-pink-500 ' +
        (mono ? 'font-mono tabular-nums ' : '') +
        (busy ? 'opacity-60' : '')
      }
    />
  )
}

function ColorChip({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
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
        className="h-7 px-1.5 rounded border border-ink-200 hover:border-ink-400 flex items-center gap-1.5"
        aria-label={label}
        title={label}
      >
        <span
          className="block w-4 h-4 rounded border border-ink-200"
          style={{ backgroundColor: value }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-700">
          {label}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-44 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30">
          <div className="flex items-center gap-2">
            <label className="relative w-7 h-7 rounded border border-ink-200 overflow-hidden cursor-pointer flex-shrink-0">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v) && v.length === 7) onChange(v)
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
