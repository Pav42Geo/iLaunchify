'use client'

// BarcodeDrawer — left-rail Barcode tool.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #10 + GTIN V1 plan.
//
// Two modes (DS-52b):
//   1. Retail UPC — creator pastes a GS1-registered UPC/EAN. Live preview,
//      check-digit validation, "i" popover educates on GS1 ownership.
//   2. Internal SKU — Code 128 with an "INTERNAL · {sku}" caption. For
//      pre-launch / sample runs where the real UPC isn't in hand yet.
//
// Both drop as a fabric.Image; DS-44 Layers, DS-47 autosave, DS-50
// keyboard shortcuts all work because they're standard objects.

import * as React from 'react'
import { Plus, Barcode as BarIcon, Info, X } from 'lucide-react'
import {
  addBarcode,
  addInternalSkuBarcode,
  generateBarcodeDataUrl,
  generateInternalSkuBarcodeDataUrl,
  validateGtin,
  BARCODE_FORMATS,
  type BarcodeFormat,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
}

type ModeKey = 'retail' | 'internal'

const FORMAT_DEFAULTS: Record<BarcodeFormat, string> = {
  UPC: '012345678905',
  EAN13: '5901234123457',
  EAN8: '12345670',
  CODE128: 'iLaunchify',
  CODE39: 'KINDRED-001',
  ITF14: '00012345678905',
}

export function BarcodeDrawer({ canvas }: Props) {
  const [mode, setMode] = React.useState<ModeKey>('retail')

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Mode
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <ModeTile
            active={mode === 'retail'}
            label="Retail UPC"
            hint="GS1-registered · for resale"
            onClick={() => setMode('retail')}
          />
          <ModeTile
            active={mode === 'internal'}
            label="Internal SKU"
            hint="Pre-launch / samples"
            onClick={() => setMode('internal')}
          />
        </div>
      </section>

      {mode === 'retail' ? <RetailUpcSection canvas={canvas} /> : <InternalSkuSection canvas={canvas} />}
    </div>
  )
}

// ============================================================================
// Retail UPC mode
// ============================================================================

function RetailUpcSection({ canvas }: { canvas: FabricCanvas | null }) {
  const [format, setFormat] = React.useState<BarcodeFormat>('UPC')
  const [text, setText] = React.useState(FORMAT_DEFAULTS.UPC)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [eduOpen, setEduOpen] = React.useState(false)

  React.useEffect(() => {
    setText((prev) => {
      const wasDefault = Object.values(FORMAT_DEFAULTS).includes(prev)
      return wasDefault ? FORMAT_DEFAULTS[format] : prev
    })
  }, [format])

  React.useEffect(() => {
    if (!text.trim()) {
      setPreview(null)
      return
    }
    setPreview(generateBarcodeDataUrl(text, format))
  }, [text, format])

  // Soft check-digit hint for UPC-A / EAN-13 / EAN-8 / ITF-14 (only the
  // formats with self-check digits). Code 128 / Code 39 aren't covered.
  const checkDigitHint = React.useMemo(() => {
    if (!['UPC', 'EAN13', 'EAN8', 'ITF14'].includes(format)) return null
    const result = validateGtin(text)
    if (result.ok) return null
    if (result.reason === 'empty') return null
    if (result.reason === 'wrong-length') return null
    if (result.reason === 'bad-check-digit')
      return 'Check digit looks wrong — paste from your GS1 record.'
    return null
  }, [text, format])

  async function handleAdd() {
    if (!canvas || !text.trim() || !preview) return
    setAdding(true)
    try {
      await addBarcode(canvas, text.trim(), format)
    } finally {
      setAdding(false)
    }
  }

  const activeMeta = BARCODE_FORMATS.find((f) => f.value === format)
  const isInvalid = text.trim().length > 0 && preview === null

  return (
    <>
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Format
          </div>
          <button
            type="button"
            onClick={() => setEduOpen(true)}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-pink-700 hover:text-pink-600"
          >
            <Info className="h-3 w-3" />
            About UPCs
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {BARCODE_FORMATS.map((f) => {
            const active = format === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                className={
                  'h-9 px-2 text-[12px] font-semibold rounded-md border transition-colors ' +
                  (active
                    ? 'bg-ink-900 text-white border-ink-900'
                    : 'bg-white text-ink-700 border-ink-300 hover:border-ink-500')
                }
              >
                {f.label}
              </button>
            )
          })}
        </div>
        {activeMeta && (
          <p className="mt-1.5 text-[11px] text-ink-500">{activeMeta.hint}</p>
        )}
      </section>

      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Data
        </div>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="w-full h-9 px-3 text-sm font-mono tabular-nums border border-ink-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
        />
        {isInvalid && (
          <p className="mt-1.5 text-[11px] text-pink-700">
            Doesn&apos;t match the {activeMeta?.label} format — check the digit
            count or allowed characters.
          </p>
        )}
        {!isInvalid && checkDigitHint && (
          <p className="mt-1.5 text-[11px] text-pink-700">{checkDigitHint}</p>
        )}
      </section>

      <PreviewBox preview={preview} alt={`${activeMeta?.label ?? format} preview`} fallback="Type data to preview" invalid={isInvalid} />

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canvas || !text.trim() || !preview || adding}
        className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {adding ? 'Adding…' : 'Add to canvas'}
      </button>

      {eduOpen && <EducationalPopover onClose={() => setEduOpen(false)} />}
    </>
  )
}

// ============================================================================
// Internal SKU mode
// ============================================================================

function InternalSkuSection({ canvas }: { canvas: FabricCanvas | null }) {
  const [sku, setSku] = React.useState('KINDRED-VAN-30CT')
  const [preview, setPreview] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    if (!sku.trim()) {
      setPreview(null)
      return
    }
    setPreview(generateInternalSkuBarcodeDataUrl(sku))
  }, [sku])

  async function handleAdd() {
    if (!canvas || !sku.trim() || !preview) return
    setAdding(true)
    try {
      await addInternalSkuBarcode(canvas, sku.trim())
    } finally {
      setAdding(false)
    }
  }

  return (
    <>
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Internal SKU
        </div>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          spellCheck={false}
          className="w-full h-9 px-3 text-sm font-mono tabular-nums border border-ink-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
        />
        <p className="mt-1.5 text-[11px] text-ink-500">
          Renders as Code 128 with an &quot;INTERNAL&quot; caption — scans for
          warehouse routing but doesn&apos;t impersonate a UPC.
        </p>
      </section>

      <PreviewBox preview={preview} alt="Internal SKU preview" fallback="Type a SKU to preview" invalid={false} />

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canvas || !sku.trim() || !preview || adding}
        className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {adding ? 'Adding…' : 'Add to canvas'}
      </button>

      <section className="rounded-md border border-pink-200 bg-pink-50/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 mb-1">
          When to use this
        </div>
        <p className="text-[11.5px] text-ink-700 leading-[1.45]">
          Use Internal SKU for early sample runs, retailer pitches, or beta
          batches where your GS1 paperwork isn&apos;t back yet. Swap to a real
          UPC before mass production.
        </p>
      </section>
    </>
  )
}

// ============================================================================
// Shared subcomponents
// ============================================================================

function ModeTile({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'text-left rounded-md border p-3 transition-all ' +
        (active
          ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-500/20'
          : 'border-ink-200 bg-white hover:border-ink-400')
      }
    >
      <div className="font-bold text-[13px] text-ink-900">{label}</div>
      <div className="text-[10.5px] text-ink-500 mt-0.5">{hint}</div>
    </button>
  )
}

function PreviewBox({
  preview,
  alt,
  fallback,
  invalid,
}: {
  preview: string | null
  alt: string
  fallback: string
  invalid: boolean
}) {
  return (
    <section>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
        Preview
      </div>
      <div className="rounded-md border border-ink-200 bg-white p-3 flex items-center justify-center min-h-[120px]">
        {preview ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={preview} alt={alt} className="max-h-24 max-w-full object-contain" />
        ) : (
          <div className="text-center text-ink-400">
            <BarIcon className="mx-auto h-6 w-6" />
            <p className="mt-1.5 text-xs">{invalid ? 'Invalid data' : fallback}</p>
          </div>
        )}
      </div>
    </section>
  )
}

function EducationalPopover({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between p-5 border-b border-ink-200">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700 mb-1">
              About UPCs
            </div>
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink-900">
              Visual vs official barcodes
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-500 hover:text-ink-900 hover:bg-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-[13.5px] leading-[1.55] text-ink-700">
          <p>
            The barcodes you generate here are <strong>scannable images</strong> — fine
            for warehouse routing, POS at your own shop, and DTC orders.
          </p>
          <p>
            For <strong>retail (Amazon Brand Registry, Walmart, Target, Costco)</strong>
            , you typically need a UPC registered to your brand through{' '}
            <a
              href="https://www.gs1.org"
              target="_blank"
              rel="noopener"
              className="text-pink-700 font-semibold hover:text-pink-600 underline"
            >
              GS1
            </a>
            . Marketplaces validate ownership against GS1&apos;s database and reject
            recycled or unregistered codes.
          </p>
          <p>
            <strong>Recommendation:</strong> register once with GS1, then paste your
            UPC here. iLaunchify validates the check digit, scans for duplicates
            across the platform, and prints it correctly on your packaging.
          </p>
          <p className="text-ink-500 text-[12.5px]">
            If your GS1 setup isn&apos;t back yet but you need samples printed,
            switch to <strong>Internal SKU</strong> mode — it&apos;s honest about not
            being a retail UPC and is the right thing to ship to a Whole Foods
            buyer for a tasting.
          </p>
        </div>
        <div className="px-5 pb-5">
          <a
            href="https://www.gs1.org/standards/get-barcodes"
            target="_blank"
            rel="noopener"
            className="block w-full text-center h-10 leading-10 bg-ink-900 text-white text-sm font-semibold rounded-md hover:bg-black transition-colors"
          >
            Get a GS1 UPC →
          </a>
        </div>
      </div>
    </div>
  )
}
