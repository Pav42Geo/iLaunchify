'use client'

// QrCodeDrawer — left-rail QR Code tool.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #9:
//   - Content input (URL / SKU / arbitrary text)
//   - Foreground + background color (brand swatches accessible via the
//     text-format toolbar after dropping; keep V1 picker simple)
//   - Live preview
//   - Add to canvas
//
// Drops as a Fabric image (data URL), so it scales/moves like any other
// layer and persists via DS-47 auto-save.

import * as React from 'react'
import { Plus, QrCode as QrIcon } from 'lucide-react'
import {
  addQrCode,
  generateQrCodeDataUrl,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
}

const DEFAULT_DARK = '#000000'
const DEFAULT_LIGHT = '#FFFFFF'

export function QrCodeDrawer({ canvas }: Props) {
  const [text, setText] = React.useState('https://yourbrand.com')
  const [dark, setDark] = React.useState(DEFAULT_DARK)
  const [light, setLight] = React.useState(DEFAULT_LIGHT)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    if (!text.trim()) {
      setPreview(null)
      return
    }
    generateQrCodeDataUrl(text, { dark, light, size: 256 })
      .then((url) => {
        if (!cancelled) setPreview(url)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [text, dark, light])

  async function handleAdd() {
    if (!canvas || !text.trim()) return
    setAdding(true)
    try {
      await addQrCode(canvas, text.trim(), { dark, light })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Content
        </div>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="URL · SKU · any text"
          className="w-full h-9 px-3 text-sm border border-ink-300 rounded-md focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/15"
        />
        <p className="mt-1.5 text-[11px] text-ink-500">
          Uses high error-correction (~30%) so the code stays scannable after
          print or overlay.
        </p>
      </section>

      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Colors
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Foreground" value={dark} onChange={setDark} />
          <ColorField label="Background" value={light} onChange={setLight} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-500">
          Scanner-friendly contrast matters: keep foreground much darker than
          background.
        </p>
      </section>

      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          Preview
        </div>
        <div className="rounded-md border border-ink-200 bg-white p-3 flex items-center justify-center min-h-[180px]">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="QR code preview"
              className="w-40 h-40"
            />
          ) : (
            <div className="text-center text-ink-400">
              <QrIcon className="mx-auto h-6 w-6" />
              <p className="mt-1.5 text-xs">Type content to preview</p>
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canvas || !text.trim() || adding}
        className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-ink-900 text-white rounded-md hover:bg-black disabled:opacity-40 disabled:hover:bg-ink-900 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {adding ? 'Adding…' : 'Add to canvas'}
      </button>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-700 font-medium">{label}</span>
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
    </label>
  )
}
