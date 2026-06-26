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
  Plus,
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
  hexToHsv,
  hsvToHex,
  TRANSPARENT_FILL,
  isTransparentFill,
  type BarcodeFormat,
  type CodeCustomData,
  type FabricCanvas,
  type FabricObject,
  type BrandCanvasAssets,
  type QrDotStyle,
  type QrCornerStyle,
  type QrGradient,
  type Hsv,
  Switch,
} from '@ilaunchify/ui'

// Session-level "recently used" color store, shared across every ColorChip (FG/BG
// of any code). In-memory ring buffer (most-recent first, de-duped); resets on
// reload. Subscribed via useSyncExternalStore so all open pickers stay in sync.
const RECENT_COLOR_LIMIT = 12
let recentColors: string[] = []
const recentColorListeners = new Set<() => void>()
function recordRecentColor(hex: string): void {
  const n = normalizeHex(hex)
  if (!n) return
  recentColors = [n, ...recentColors.filter((c) => c !== n)].slice(0, RECENT_COLOR_LIMIT)
  recentColorListeners.forEach((l) => l())
}
function useRecentColors(): string[] {
  return React.useSyncExternalStore(
    (cb) => {
      recentColorListeners.add(cb)
      return () => recentColorListeners.delete(cb)
    },
    () => recentColors,
    () => recentColors,
  )
}

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
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20" style={{ zoom: 1.2 }}>
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
        allowTransparent
        allowGradient
        gradient={data.gradient ?? null}
        onGradientChange={(g) => onChange({ ...data, gradient: g })}
      />
      <ColorChip
        label="BG"
        value={data.light}
        onChange={(c) => onChange({ ...data, light: c })}
        brandSwatches={brandSwatches}
        allowTransparent
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
            <Switch
              checked={!!data.iconUrl}
              disabled={!brandLogoUrl}
              onChange={() => onChange({ ...data, iconUrl: data.iconUrl ? null : brandLogoUrl })}
              aria-label="Center logo"
              className="flex-shrink-0"
            />
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

// A labeled row of swatches (Recently used / Brand colors / Default).
function SwatchGroup({
  label,
  colors,
  value,
  onPick,
}: {
  label: string
  colors: string[]
  value: string
  onPick: (hex: string) => void
}) {
  const current = normalizeHex(value) ?? ''
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="grid grid-cols-6 gap-1.5">
        {colors.map((hex) => {
          const norm = normalizeHex(hex) ?? hex
          const active = current === norm
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onPick(norm)}
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
    </div>
  )
}

const CHECKER_BG =
  'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 10px 10px'

function gradientCss(g: QrGradient): string {
  return `linear-gradient(${g.angle ?? 45}deg, ${g.from}, ${g.to})`
}

// Saturation/Value square + hue slider — a full visual color picker.
function SVColorField({
  value,
  onChange,
  onCommit,
}: {
  value: string
  onChange: (hex: string) => void
  onCommit: (hex: string) => void
}) {
  const [hsv, setHsv] = React.useState<Hsv>(() => hexToHsv(value))
  const lastHex = React.useRef(value)
  React.useEffect(() => {
    if ((normalizeHex(value) ?? '') !== (normalizeHex(lastHex.current) ?? '')) {
      setHsv(hexToHsv(value))
      lastHex.current = value
    }
  }, [value])

  const emit = (next: Hsv, commit: boolean) => {
    setHsv(next)
    const hex = hsvToHex(next)
    lastHex.current = hex
    if (commit) onCommit(hex)
    else onChange(hex)
  }

  const areaRef = React.useRef<HTMLDivElement>(null)
  const hueRef = React.useRef<HTMLDivElement>(null)

  const onSV = (clientX: number, clientY: number, commit: boolean) => {
    const el = areaRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 100
    const v = (1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height))) * 100
    emit({ h: hsv.h, s: Math.round(s), v: Math.round(v) }, commit)
  }
  const onHue = (clientX: number, commit: boolean) => {
    const el = hueRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const h = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * 360
    emit({ ...hsv, h: Math.round(h) }, commit)
  }

  const hueColor = `hsl(${hsv.h} 100% 50%)`
  return (
    <div className="space-y-2">
      <div
        ref={areaRef}
        className="relative h-28 w-full cursor-crosshair rounded-md border border-ink-200"
        style={{
          backgroundColor: hueColor,
          backgroundImage:
            'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onSV(e.clientX, e.clientY, false)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) onSV(e.clientX, e.clientY, false)
        }}
        onPointerUp={(e) => onSV(e.clientX, e.clientY, true)}
      >
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: hsvToHex(hsv) }}
        />
      </div>
      <div
        ref={hueRef}
        className="relative h-3 w-full cursor-pointer rounded-full"
        style={{
          backgroundImage:
            'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onHue(e.clientX, false)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) onHue(e.clientX, false)
        }}
        onPointerUp={(e) => onHue(e.clientX, true)}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }}
        />
      </div>
    </div>
  )
}

// A single gradient stop (From / To): native picker + hex + brand swatches.
function GradientStop({
  label,
  value,
  brandSwatches,
  onChange,
}: {
  label: string
  value: string
  brandSwatches: string[]
  onChange: (c: string) => void
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="flex items-center gap-1.5">
        <label className="relative h-7 w-7 flex-shrink-0 cursor-pointer overflow-hidden rounded border border-ink-200">
          <input
            type="color"
            value={normalizeHex(value) ?? '#000000'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
          className="h-7 w-full min-w-0 rounded border border-ink-200 px-1.5 text-[11px] font-mono tabular-nums focus:border-pink-500 focus:outline-none"
        />
      </div>
      {brandSwatches.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {brandSwatches.slice(0, 6).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              className="h-4 w-4 rounded border border-ink-200"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Two-color gradient builder with a live preview + angle.
function GradientPanel({
  value,
  active,
  brandSwatches,
  onChange,
  onRemove,
}: {
  value: QrGradient
  active: boolean
  brandSwatches: string[]
  onChange: (g: QrGradient) => void
  onRemove: () => void
}) {
  const [g, setG] = React.useState<QrGradient>(value)
  React.useEffect(() => {
    setG(value)
  }, [value.from, value.to, value.angle])
  const update = (patch: Partial<QrGradient>) => {
    const next = { ...g, ...patch }
    setG(next)
    if (active) onChange(next)
  }
  return (
    <div className="mt-2.5 space-y-2.5">
      <div
        className="h-9 w-full rounded-md border border-ink-200"
        style={{ backgroundImage: gradientCss(g) }}
      />
      <div className="grid grid-cols-2 gap-2">
        <GradientStop label="From" value={g.from} brandSwatches={brandSwatches} onChange={(c) => update({ from: c })} />
        <GradientStop label="To" value={g.to} brandSwatches={brandSwatches} onChange={(c) => update({ to: c })} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Angle</span>
        <input
          type="range"
          min={0}
          max={360}
          value={g.angle ?? 45}
          onChange={(e) => update({ angle: Number(e.target.value) })}
          className="flex-1 accent-pink-500"
          aria-label="Gradient angle"
        />
        <span className="w-9 text-right text-[11px] tabular-nums text-ink-600">{g.angle ?? 45}°</span>
      </div>
      {active ? (
        <button
          type="button"
          onClick={onRemove}
          className="w-full rounded-md border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
        >
          Remove gradient
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onChange(g)}
          className="w-full rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-700"
        >
          Use gradient
        </button>
      )}
    </div>
  )
}

function ColorChip({
  label,
  value,
  onChange,
  brandSwatches,
  allowTransparent = false,
  allowGradient = false,
  gradient = null,
  onGradientChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  brandSwatches: string[]
  allowTransparent?: boolean
  allowGradient?: boolean
  gradient?: QrGradient | null
  onGradientChange?: (g: QrGradient | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'picker' | 'gradient' | 'cmyk'>('picker')
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const recent = useRecentColors()
  const transparent = allowTransparent && isTransparentFill(value)
  const gradientOn = allowGradient && !!gradient
  const solid = transparent ? '#000000' : normalizeHex(value) ?? '#000000'
  const cmyk = hexToCmyk(solid)
  const brand = Array.from(new Set(brandSwatches.map((h) => normalizeHex(h) ?? h)))

  // Picking a solid color clears any gradient + transparent state.
  const setSolid = (hex: string, record: boolean) => {
    const n = normalizeHex(hex) ?? hex
    if (record) recordRecentColor(n)
    if (gradientOn) onGradientChange?.(null)
    onChange(n)
  }
  const setCmyk = (patch: Partial<typeof cmyk>) => setSolid(cmykToHex({ ...cmyk, ...patch }), false)
  const gradientSeed: QrGradient = gradient ?? { from: solid, to: '#7C3AED', angle: 45 }

  const previewStyle: React.CSSProperties = gradientOn
    ? { backgroundImage: gradientCss(gradient as QrGradient) }
    : transparent
      ? { background: CHECKER_BG }
      : { backgroundColor: value }

  const tabs: Array<'picker' | 'gradient' | 'cmyk'> = allowGradient
    ? ['picker', 'gradient', 'cmyk']
    : ['picker', 'cmyk']

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 rounded border border-ink-200 hover:border-ink-400 flex items-center gap-1.5"
        aria-label={label}
        title={label}
      >
        <span className="block w-4 h-4 rounded border border-ink-200" style={previewStyle} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-700">{label}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-60 bg-white border border-ink-200 rounded-lg shadow-xl p-3 z-30">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-ink-200">
            {tabs.map((t) => (
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
                {t === 'picker' ? 'Picker' : t === 'gradient' ? 'Gradient' : 'CMYK'}
              </button>
            ))}
          </div>

          {tab === 'picker' && (
            <div className="mt-2.5 space-y-2.5">
              <SVColorField
                value={solid}
                onChange={(h) => setSolid(h, false)}
                onCommit={(h) => setSolid(h, true)}
              />
              {/* hex + transparent + native "+" picker */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  defaultValue={transparent ? '' : value}
                  key={value}
                  placeholder={transparent ? 'Transparent' : undefined}
                  onBlur={(e) => {
                    const n = normalizeHex(e.target.value)
                    if (n) setSolid(n, true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  spellCheck={false}
                  className="h-7 flex-1 min-w-0 rounded border border-ink-200 px-2 text-[12px] font-mono tabular-nums focus:border-pink-500 focus:outline-none"
                />
                {allowTransparent && (
                  <button
                    type="button"
                    onClick={() => {
                      onGradientChange?.(null)
                      onChange(TRANSPARENT_FILL)
                    }}
                    title="Transparent"
                    className={
                      'flex h-7 items-center gap-1 rounded border px-1.5 text-[10px] font-semibold ' +
                      (transparent ? 'border-pink-500 ring-2 ring-pink-500/25 text-pink-700' : 'border-ink-200 text-ink-600 hover:border-ink-400')
                    }
                  >
                    <span className="h-3.5 w-3.5 rounded-sm border border-ink-200" style={{ background: CHECKER_BG }} />
                    None
                  </button>
                )}
                <label
                  className="relative flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border border-ink-200 text-ink-600 hover:border-ink-400"
                  title="Pick a color"
                >
                  <input
                    type="color"
                    value={solid}
                    onChange={(e) => setSolid(e.target.value.toUpperCase(), true)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <Plus className="h-3.5 w-3.5" />
                </label>
              </div>
              {recent.length > 0 && (
                <SwatchGroup label="Recently used" colors={recent} value={value} onPick={(h) => setSolid(h, true)} />
              )}
              {brand.length > 0 && (
                <SwatchGroup label="Brand colors" colors={brand} value={value} onPick={(h) => setSolid(h, true)} />
              )}
            </div>
          )}

          {tab === 'gradient' && (
            <GradientPanel
              value={gradientSeed}
              active={gradientOn}
              brandSwatches={brand}
              onChange={(ng) => onGradientChange?.(ng)}
              onRemove={() => onGradientChange?.(null)}
            />
          )}

          {tab === 'cmyk' && (
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
