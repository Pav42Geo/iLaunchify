'use client'

// ExportModal — generate a print-ready PDF (or PNG) of the design
// (DS-64b).
//
// Format choice:
//   PDF (default) — mm-accurate page size, embeds PNG snapshot at the
//                   chosen DPI, ready for the print partner. Use this
//                   for production.
//   PNG          — raw raster export at the chosen DPI. Useful for
//                  proofs, mockup decks, or social previews.
//
// Bleed default: PDF→true (printer needs the overhang), PNG→false
// (designer usually wants the trim view).

import * as React from 'react'
import { X, Download, FileText, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import {
  generatePrintReadyPdf,
  snapshotCanvasAsPng,
  snapshotCanvasTrimmed,
  suggestedPdfFilename,
  type DieCutSpec,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  dieCut: DieCutSpec
  pxPerMm: number
  brandName: string
  productName: string
  open: boolean
  onClose: () => void
  /** Called after a successful download so the shell can stamp DesignVersion.exportedAt. */
  onExported?: () => Promise<void> | void
}

type Format = 'pdf' | 'png'

const DPI_OPTIONS: Array<{ value: 150 | 300 | 600; label: string; hint: string }> = [
  { value: 150, label: '150 DPI', hint: 'Web proof' },
  { value: 300, label: '300 DPI', hint: 'Print-shop standard' },
  { value: 600, label: '600 DPI', hint: 'High-end offset' },
]

export function ExportModal({
  canvas,
  dieCut,
  pxPerMm,
  brandName,
  productName,
  open,
  onClose,
  onExported,
}: Props) {
  const [format, setFormat] = React.useState<Format>('pdf')
  const [includeBleed, setIncludeBleed] = React.useState(true)
  const [dpi, setDpi] = React.useState<150 | 300 | 600>(300)
  const [generating, setGenerating] = React.useState(false)
  const [lastExportedAt, setLastExportedAt] = React.useState<Date | null>(null)

  // When the user flips format, reset bleed to the format-typical default.
  React.useEffect(() => {
    setIncludeBleed(format === 'pdf')
  }, [format])

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleGenerate() {
    if (!canvas) return
    setGenerating(true)
    try {
      if (format === 'pdf') {
        const blob = await generatePrintReadyPdf({
          canvas,
          dieCut,
          pxPerMm,
          includeBleed,
          dpi,
          meta: { brandName, productName, dieCutName: dieCut.name },
        })
        const filename = suggestedPdfFilename({ brandName, productName })
        downloadBlob(blob, filename)
      } else {
        // PNG path — use the snapshot helpers at the chosen DPI.
        const targetPxPerMm = dpi / 25.4
        const multiplier = targetPxPerMm / pxPerMm
        const dataUrl = includeBleed
          ? snapshotCanvasAsPng(canvas, { multiplier })
          : snapshotCanvasTrimmed({ canvas, dieCut, pxPerMm, multiplier })
        const blob = dataUrlToBlob(dataUrl)
        const filename = suggestedPdfFilename({ brandName, productName }).replace(
          /\.pdf$/,
          '.png',
        )
        downloadBlob(blob, filename)
      }
      setLastExportedAt(new Date())
      if (onExported) await onExported()
    } catch (err) {
      console.warn('[ExportModal] generate failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/70 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Export design"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-ink-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Export
            </div>
            <h2 className="mt-0.5 text-base font-semibold text-ink-900">
              Generate a print-ready file
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-500 hover:bg-ink-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          {/* Format */}
          <section>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
              Format
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormatTile
                active={format === 'pdf'}
                onClick={() => setFormat('pdf')}
                icon={FileText}
                label="PDF"
                hint="Print-ready · vector container"
              />
              <FormatTile
                active={format === 'png'}
                onClick={() => setFormat('png')}
                icon={ImageIcon}
                label="PNG"
                hint="Proof · social preview"
              />
            </div>
          </section>

          {/* Resolution */}
          <section>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
              Resolution
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DPI_OPTIONS.map((opt) => {
                const active = dpi === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDpi(opt.value)}
                    aria-pressed={active}
                    className={
                      'rounded-md border p-2.5 text-left transition-all ' +
                      (active
                        ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-500/20'
                        : 'border-ink-200 bg-white hover:border-ink-400')
                    }
                  >
                    <div className="font-bold text-[12.5px] text-ink-900">
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-ink-500 mt-0.5">{opt.hint}</div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Bleed */}
          <section>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <button
                type="button"
                onClick={() => setIncludeBleed((v) => !v)}
                aria-pressed={includeBleed}
                className={
                  'mt-0.5 w-4 h-4 border-[1.5px] rounded relative flex-shrink-0 transition-colors ' +
                  (includeBleed
                    ? 'bg-pink-500 border-pink-500'
                    : 'border-ink-300 hover:border-ink-500')
                }
              >
                {includeBleed && (
                  <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] font-bold">
                    ✓
                  </span>
                )}
              </button>
              <div>
                <div className="text-[13px] font-semibold text-ink-900">
                  Include bleed ({dieCut.bleedMm}mm)
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500 leading-[1.45]">
                  Printer needs bleed for accurate trimming. Turn off for a
                  designer proof showing only the visible label.
                </p>
              </div>
            </label>
          </section>

          {/* Output summary */}
          <section className="rounded-md border border-ink-200 bg-ink-50/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Output
            </div>
            <p className="mt-1 text-[11.5px] text-ink-700 font-mono tabular-nums">
              {(includeBleed
                ? dieCut.widthMm + 2 * dieCut.bleedMm
                : dieCut.widthMm
              ).toFixed(1)}
              {' × '}
              {(includeBleed
                ? dieCut.heightMm + 2 * dieCut.bleedMm
                : dieCut.heightMm
              ).toFixed(1)}
              {' mm · '}
              {dpi} DPI · {format.toUpperCase()}
            </p>
          </section>

          {/* CMYK disclosure */}
          <section className="rounded-md border border-amber-200 bg-amber-50/60 p-3 flex gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                RGB output · printer converts to CMYK
              </div>
              <p className="mt-1 text-[11px] text-amber-900 leading-[1.45]">
                V1 exports embed RGB. Your print partner's RIP handles
                CMYK conversion. Solid neons (pink #FF2E63, neon
                green) shift slightly under standard CMYK — review the
                press proof.
              </p>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between border-t border-ink-200 px-5 py-3.5">
          <div className="text-[10.5px] text-ink-500 tabular-nums">
            {lastExportedAt && `Last exported ${relative(lastExportedAt)}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-ink-700 hover:bg-ink-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canvas || generating}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {generating ? 'Generating…' : 'Generate + Download'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-controls
// ============================================================================

function FormatTile({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex items-start gap-2.5 rounded-md border p-3 text-left transition-all ' +
        (active
          ? 'border-pink-500 bg-pink-50 ring-2 ring-pink-500/20'
          : 'border-ink-200 bg-white hover:border-ink-400')
      }
    >
      <Icon className="h-4 w-4 text-pink-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-bold text-[12.5px] text-ink-900">{label}</div>
        <div className="text-[10.5px] text-ink-500 mt-0.5 leading-[1.3]">
          {hint}
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// Util
// ============================================================================

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a tick to actually start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = /:(.*?);/.exec(header ?? '')
  const mime = mimeMatch?.[1] ?? 'application/octet-stream'
  const bin = atob(base64 ?? '')
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function relative(d: Date): string {
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  return `${mins}m ago`
}
