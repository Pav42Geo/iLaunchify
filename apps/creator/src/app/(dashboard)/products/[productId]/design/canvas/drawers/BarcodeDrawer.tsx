'use client'

// BarcodeDrawer — left-rail Barcode tool.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #10:
//   - Format dropdown (UPC / EAN-13 / EAN-8 / Code 128 / Code 39 / ITF-14)
//   - Data input
//   - Live preview (or "Invalid for this format" hint if jsbarcode rejects it)
//   - Add to canvas

import * as React from 'react'
import { Plus, Barcode as BarIcon } from 'lucide-react'
import {
  addBarcode,
  generateBarcodeDataUrl,
  BARCODE_FORMATS,
  type BarcodeFormat,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
}

const FORMAT_DEFAULTS: Record<BarcodeFormat, string> = {
  UPC: '012345678905',
  EAN13: '5901234123457',
  EAN8: '12345670',
  CODE128: 'iLaunchify',
  CODE39: 'KINDRED-001',
  ITF14: '00012345678905',
}

export function BarcodeDrawer({ canvas }: Props) {
  const [format, setFormat] = React.useState<BarcodeFormat>('UPC')
  const [text, setText] = React.useState(FORMAT_DEFAULTS.UPC)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  // When format changes, swap to its default sample if user hasn't customized.
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
    const url = generateBarcodeDataUrl(text, format)
    setPreview(url)
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
    <div className="space-y-5">
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Format
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
      </section>

      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Preview
        </div>
        <div className="rounded-md border border-ink-200 bg-white p-3 flex items-center justify-center min-h-[120px]">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt={`${activeMeta?.label ?? format} preview`}
              className="max-h-24 max-w-full object-contain"
            />
          ) : (
            <div className="text-center text-ink-400">
              <BarIcon className="mx-auto h-6 w-6" />
              <p className="mt-1.5 text-xs">
                {isInvalid ? 'Invalid data' : 'Type data to preview'}
              </p>
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canvas || !text.trim() || !preview || adding}
        className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {adding ? 'Adding…' : 'Add to canvas'}
      </button>
    </div>
  )
}
