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
  Check,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Shapes,
} from 'lucide-react'
import {
  regenerateCodeImage,
  BARCODE_FORMATS,
  QR_DOT_STYLES,
  QR_CORNER_STYLES,
  hexToCmyk,
  cmykToHex,
  normalizeHex,
  type BarcodeFormat,
  type CodeCustomData,
  type FabricCanvas,
  type FabricObject,
  type BrandCanvasAssets,
  type QrDotStyle,
  type QrCornerStyle,
} from '@ilaunchify/ui'

const STAPLE_SWATCHES = [
  '#000000', '#FFFFFF', '#FF2E63', '#B5FF3D', '#0F1116',
  '#1E90FF', '#10B981', '#F59E0B', '#7C3AED', '#EF4444',
]

interface Props {
  canvas: FabricCanvas | null
  active: FabricObject
  brandAssets?: BrandCanvasAssets
}

export function CodeToolbar({ canvas, active, brandAssets }: Props) {
  const brandSwatches = brandAssets
    ? Array.from(
        new Set(
          [
            brandAssets.colorPrimary,
            brandAssets.colorSecondary,
            brandAssets.colorAccent,
            ...brandAssets.extraSwatches,
          ].filter((c): c is string => Boolean(c)),
        ),
      )
    : []
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
          <QrFields
            data={data}
            onChange={regen}
            busy={regenerating}
            brandSwatches={brandSwatches}
            brandLogoUrl={brandAssets?.logos.find((l) => l.publicUrl)?.publicUrl ?? null}
          />
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
          <span className="text-[12px] font-bold uppercase tracking-wider text-ink-700">
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
  brandSwatches,
  brandLogoUrl,
}: {
  data: Extract<CodeCustomData, { kind: 'qr' }>
  onChange: (d: CodeCustomData) => void
  busy: boolean
  brandSwatches: string[]
  brandLogoUrl: string | null
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
        brandSwatches={brandSwatches}
      />
      <ColorChip
        label="BG"
        value={data.light}
        onChange={(c) => onChange({ ...data, light: c })}
        brandSwatches={brandSwatches}
      />
      <QrStyleChip data={data} onChange={onChange} brandLogoUrl={brandLogoUrl} />
    </>
  )
}

function QrStyleChip({
  data,
  onChange,
  brandLogoUrl,
}: {
  data: Extract<CodeCustomData, { kind: 'qr' }>
  onChange: (d: CodeCustomData) => void
  brandLogoUrl: string | null
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

  const dot = data.dotStyle ?? 'square'
  const corner = data.cornerStyle ?? 'square'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 rounded border border-ink-200 hover:border-ink-400 flex items-center gap-1"
        aria-label="QR style"
        title="QR style"
      >
        <Shapes className="h-3.5 w-3.5 text-ink-700" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-700">Style</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30 space-y-3">
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Corners</div>
            <div className="grid grid-cols-4 gap-1.5">
              {QR_CORNER_STYLES.map((s) => (
                <StyleOption
                  key={s.value}
                  label={s.label}
                  active={corner === s.value}
                  preview={<CornerPreview style={s.value} active={corner === s.value} />}
                  onClick={() => onChange({ ...data, cornerStyle: s.value as QrCornerStyle })}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">Dots</div>
            <div className="grid grid-cols-4 gap-1.5">
              {QR_DOT_STYLES.map((s) => (
                <StyleOption
                  key={s.value}
                  label={s.label}
                  active={dot === s.value}
                  preview={<DotPreview style={s.value} active={dot === s.value} />}
                  onClick={() => onChange({ ...data, dotStyle: s.value as QrDotStyle })}
                />
              ))}
            </div>
          </div>
          {/* Centre icon — embed the brand logo (DS-54b). */}
          <div className="flex items-center justify-between border-t border-ink-100 pt-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-ink-800">Center logo</div>
              <div className="truncate text-[10px] text-ink-400">
                {brandLogoUrl ? 'Your brand logo, scan-safe' : 'Add a logo in your Brand kit first'}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!data.iconUrl}
              disabled={!brandLogoUrl}
              onClick={() => onChange({ ...data, iconUrl: data.iconUrl ? null : brandLogoUrl })}
              className={
                'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-40 ' +
                (data.iconUrl ? 'bg-pink-600' : 'bg-ink-300')
              }
            >
              <span
                className={
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ' +
                  (data.iconUrl ? 'left-0.5 translate-x-4' : 'left-0.5')
                }
              />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StyleOption({
  label,
  active,
  preview,
  onClick,
}: {
  label: string
  active: boolean
  preview: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={
        'relative flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-md border bg-white transition-all ' +
        (active
          ? 'border-pink-500 ring-2 ring-pink-500/20'
          : 'border-ink-200 hover:border-ink-400')
      }
    >
      {active && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-pink-600 text-white shadow-sm">
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      )}
      <span className={active ? 'text-pink-600' : 'text-ink-700'}>{preview}</span>
      <span className={'text-[8.5px] font-semibold ' + (active ? 'text-pink-700' : 'text-ink-500')}>
        {label}
      </span>
    </button>
  )
}

// SVG path for a rounded rect with only the top-left + bottom-right corners rounded
// (the "classy"/"leaf" QR shape) — mirrors leafPath() in the styled-QR renderer.
function leafD(x: number, y: number, s: number, r: number): string {
  return `M${x + r},${y} H${x + s} V${y + s - r} A${r},${r} 0 0 1 ${x + s - r},${y + s} H${x} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
}

/** Mini preview of a QR finder (corner) style. Inherits color via currentColor. */
function CornerPreview({ style }: { style: QrCornerStyle; active?: boolean }) {
  const f = 'currentColor'
  const hole = '#ffffff'
  let body: React.ReactNode
  if (style === 'leaf') {
    body = (
      <>
        <path d={leafD(3, 3, 18, 6)} fill={f} />
        <path d={leafD(6, 6, 12, 4)} fill={hole} />
        <path d={leafD(9, 9, 6, 2.2)} fill={f} />
      </>
    )
  } else if (style === 'dot') {
    body = (
      <>
        <circle cx={12} cy={12} r={9} fill={f} />
        <circle cx={12} cy={12} r={6} fill={hole} />
        <circle cx={12} cy={12} r={3} fill={f} />
      </>
    )
  } else {
    const rx = style === 'square' ? 0 : style === 'rounded' ? 3 : style === 'rounded-dot' ? 4 : 5
    const innerEllipse = style === 'extra-rounded' || style === 'rounded-dot'
    body = (
      <>
        <rect x={3} y={3} width={18} height={18} rx={rx} fill={f} />
        <rect x={6} y={6} width={12} height={12} rx={Math.max(0, rx - 1.5)} fill={hole} />
        {innerEllipse ? (
          <circle cx={12} cy={12} r={3} fill={f} />
        ) : (
          <rect x={9} y={9} width={6} height={6} rx={Math.max(0, rx - 2)} fill={f} />
        )}
      </>
    )
  }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      {body}
    </svg>
  )
}

/** Mini preview of a QR dot (module) style, drawn as a 5-cell checkerboard motif. */
function DotPreview({ style }: { style: QrDotStyle; active?: boolean }) {
  const f = 'currentColor'
  const cell = 6
  const cells: React.ReactNode[] = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 !== 0) continue // X / checker motif
      const x = 2 + j * 7
      const y = 2 + i * 7
      const key = `${i}-${j}`
      if (style === 'dots') {
        cells.push(<circle key={key} cx={x + cell / 2} cy={y + cell / 2} r={cell / 2} fill={f} />)
      } else if (style === 'diamond') {
        cells.push(
          <path
            key={key}
            d={`M${x + cell / 2},${y} L${x + cell},${y + cell / 2} L${x + cell / 2},${y + cell} L${x},${y + cell / 2} Z`}
            fill={f}
          />,
        )
      } else if (style === 'classy') {
        cells.push(<path key={key} d={leafD(x, y, cell, 2.6)} fill={f} />)
      } else if (style === 'classy-rounded') {
        cells.push(<path key={key} d={leafD(x, y, cell, 4)} fill={f} />)
      } else {
        const rx = style === 'rounded' ? 1.8 : style === 'extra-rounded' ? 3 : 0
        cells.push(<rect key={key} x={x} y={y} width={cell} height={cell} rx={rx} fill={f} />)
      }
    }
  }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      {cells}
    </svg>
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
  brandSwatches,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  brandSwatches: string[]
}) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'swatches' | 'cmyk'>('swatches')
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const cmyk = hexToCmyk(value)
  const setCmyk = (patch: Partial<typeof cmyk>) => onChange(cmykToHex({ ...cmyk, ...patch }))

  const swatches = Array.from(new Set([...brandSwatches, ...STAPLE_SWATCHES]))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 rounded border border-ink-200 hover:border-ink-400 flex items-center gap-1.5"
        aria-label={label}
        title={label}
      >
        <span className="block w-4 h-4 rounded border border-ink-200" style={{ backgroundColor: value }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-700">{label}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30">
          {/* Header: native picker (eyedropper) + hex */}
          <div className="flex items-center gap-2">
            <label className="relative w-7 h-7 rounded border border-ink-200 overflow-hidden cursor-pointer flex-shrink-0">
              <input
                type="color"
                value={normalizeHex(value) ?? '#000000'}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="absolute inset-0" style={{ backgroundColor: value }} />
            </label>
            <input
              type="text"
              defaultValue={value}
              key={value}
              onBlur={(e) => {
                const n = normalizeHex(e.target.value)
                if (n) onChange(n)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              spellCheck={false}
              className="flex-1 h-7 px-2 text-[12px] font-mono tabular-nums border border-ink-200 rounded focus:outline-none focus:border-pink-500"
            />
          </div>

          {/* Tabs */}
          <div className="mt-2.5 flex gap-1 border-b border-ink-200">
            {(['swatches', 'cmyk'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={
                  'px-2 pb-1.5 text-[11.5px] font-semibold transition-colors ' +
                  (tab === t
                    ? 'text-ink-900 border-b-2 border-pink-500'
                    : 'text-ink-500 hover:text-ink-700')
                }
              >
                {t === 'swatches' ? 'Swatches' : 'CMYK'}
              </button>
            ))}
          </div>

          {tab === 'swatches' ? (
            <div className="mt-2.5 grid grid-cols-6 gap-1.5">
              {swatches.map((hex) => {
                const active = (normalizeHex(value) ?? '') === (normalizeHex(hex) ?? hex)
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onChange(normalizeHex(hex) ?? hex)}
                    title={hex}
                    className={
                      'aspect-square rounded border transition-all ' +
                      (active ? 'border-pink-500 ring-2 ring-pink-500/25' : 'border-ink-200 hover:border-ink-400')
                    }
                    style={{ backgroundColor: hex }}
                  >
                    <span className="sr-only">{hex}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              {([
                ['C', cmyk.c, (n: number) => setCmyk({ c: n })],
                ['M', cmyk.m, (n: number) => setCmyk({ m: n })],
                ['Y', cmyk.y, (n: number) => setCmyk({ y: n })],
                ['K', cmyk.k, (n: number) => setCmyk({ k: n })],
              ] as const).map(([ch, val, set]) => (
                <div key={ch} className="flex items-center gap-2">
                  <span className="w-3 text-[11px] font-bold text-ink-700">{ch}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={val}
                    onChange={(e) => set(Number(e.target.value))}
                    className="flex-1 accent-pink-500"
                    aria-label={`${ch} value`}
                  />
                  <span className="w-9 text-right text-[11px] tabular-nums text-ink-600">{val}%</span>
                </div>
              ))}
              <p className="text-[10px] text-ink-400">CMYK is a screen reference — the printer’s RIP is authoritative.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
