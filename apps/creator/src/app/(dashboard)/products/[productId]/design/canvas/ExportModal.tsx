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
import {
  X,
  Download,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
} from 'lucide-react'
import {
  generatePrintReadyPdf,
  scanLabelCompliance,
  snapshotCanvasAsPng,
  snapshotCanvasTrimmed,
  suggestedPdfFilename,
  type DieCutSpec,
  type FabricCanvas,
  type LabelScanContext,
  type LabelScanResult,
  type ScanFinding,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  dieCut: DieCutSpec
  pxPerMm: number
  brandName: string
  productName: string
  open: boolean
  onClose: () => void
  /**
   * Called after a successful download. Receives an optional
   * acknowledgement payload when the user clicked through a blocking
   * compliance scan — the shell persists it onto DesignVersion so
   * admin / legal can see who acked which findings.
   */
  onExported?: (ack: ExportAck) => Promise<void> | void
  /**
   * Compliance scan context (recipe → allergens / BE / netQty). DS-69
   * runs the scan inside the modal so the user has to acknowledge any
   * blocking issues before downloading.
   */
  productCtx: LabelScanContext
  /** Switch the right-side panel to Compliance so the user can review. */
  onOpenCompliance?: () => void
}

/**
 * Acknowledgement payload — surfaces back to the server action via
 * recordDesignExport so we can persist who clicked through what.
 */
export interface ExportAck {
  /** True when the creator explicitly acked blocking findings. */
  acknowledged: boolean
  /** Per-finding receipt — id + title + severity. Stored verbatim. */
  ackedFindings?: Array<{
    id: string
    title: string
    severity: 'BLOCKING' | 'WARNING' | 'INFO'
    citation?: string
  }>
  /** ISO timestamp of when the user ticked the box. */
  ackedAt?: string
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
  productCtx,
  onOpenCompliance,
}: Props) {
  const [format, setFormat] = React.useState<Format>('pdf')
  const [includeBleed, setIncludeBleed] = React.useState(true)
  const [dpi, setDpi] = React.useState<150 | 300 | 600>(300)
  const [generating, setGenerating] = React.useState(false)
  const [lastExportedAt, setLastExportedAt] = React.useState<Date | null>(null)
  const [acknowledged, setAcknowledged] = React.useState(false)

  // DS-69a — fresh scan every time the modal opens so the user always
  // sees the current state, not a cached count from a prior open.
  const [scan, setScan] = React.useState<LabelScanResult | null>(null)
  React.useEffect(() => {
    if (!open || !canvas) {
      setScan(null)
      setAcknowledged(false)
      return
    }
    try {
      setScan(scanLabelCompliance(canvas, productCtx))
    } catch (err) {
      console.warn('[ExportModal] scan failed:', err)
      setScan(null)
    }
  }, [open, canvas, productCtx])

  const blockingFindings: ScanFinding[] = scan
    ? scan.findings.filter((f) => f.severity === 'BLOCKING')
    : []
  const hasBlockings = blockingFindings.length > 0
  // Generate is gated only when there ARE blockings AND the user
  // hasn't acked yet. Clean designs proceed instantly.
  const generateBlocked = hasBlockings && !acknowledged

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
      if (onExported) {
        // Build the ack payload — server action persists it on
        // DesignVersion.generationMeta for audit trail.
        const ack: ExportAck = hasBlockings
          ? {
              acknowledged: true,
              ackedAt: new Date().toISOString(),
              ackedFindings: blockingFindings.map((f) => ({
                id: f.id,
                title: f.title,
                severity: f.severity,
                citation: f.citation,
              })),
            }
          : { acknowledged: false }
        await onExported(ack)
      }
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
          {/* DS-69b — Blocking compliance findings warning. Only renders
              when scan returns ≥1 blocking finding. Generate button is
              gated until the user explicitly acknowledges. */}
          {hasBlockings && (
            <BlockingWarning
              findings={blockingFindings}
              acknowledged={acknowledged}
              onToggleAck={() => setAcknowledged((v) => !v)}
              onReviewIssues={() => {
                if (onOpenCompliance) {
                  onClose()
                  onOpenCompliance()
                }
              }}
            />
          )}

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
              disabled={!canvas || generating || generateBlocked}
              title={
                generateBlocked
                  ? 'Tick the acknowledgement above to proceed at your own risk.'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {/* DS-72d forward-pointer — when the order-checkout flow
                  (Phase G) reuses this ack pattern, the verb switches to
                  'Proceed at my risk' because the user is committing to
                  production, not just exporting a file. The ExportAck
                  payload itself is generic — only the button copy +
                  onExported handler change. See AUTO_RECOGNITION_PLAN.md. */}
              {generating
                ? 'Generating…'
                : hasBlockings && acknowledged
                  ? 'Export at my risk'
                  : 'Generate + Download'}
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

// ============================================================================
// BlockingWarning — DS-69b "you have unresolved issues" override gate
// ============================================================================

function BlockingWarning({
  findings,
  acknowledged,
  onToggleAck,
  onReviewIssues,
}: {
  findings: ScanFinding[]
  acknowledged: boolean
  onToggleAck: () => void
  onReviewIssues: () => void
}) {
  const count = findings.length
  return (
    <section
      className={
        'rounded-md border p-3.5 ' +
        (acknowledged
          ? 'border-amber-300 bg-amber-50/60'
          : 'border-pink-500 bg-pink-50')
      }
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertOctagon
          className={
            'h-4 w-4 flex-shrink-0 mt-0.5 ' +
            (acknowledged ? 'text-amber-700' : 'text-pink-700')
          }
        />
        <div className="flex-1">
          <div className="text-[12.5px] font-bold text-ink-900">
            {count} unresolved compliance {count === 1 ? 'issue' : 'issues'}
          </div>
          <p className="mt-1 text-[11.5px] text-ink-700 leading-[1.5]">
            Required FDA-label elements are missing or malformed. If a
            professional designer prepared this artwork and you&apos;ve
            reviewed it offline, you can proceed at your own risk —
            otherwise fix the issues first and re-run the scan.
          </p>

          {/* Top 3 findings as a list — gives the user enough context to
              decide without leaving the modal. */}
          <ul className="mt-2 space-y-0.5 text-[11px] text-ink-700">
            {findings.slice(0, 3).map((f) => (
              <li key={f.id} className="flex gap-1.5">
                <span className="text-pink-700 font-bold">•</span>
                <span>
                  <span className="font-semibold">{f.title}</span>
                  {f.citation && (
                    <span className="text-ink-500 font-mono ml-1.5 text-[10.5px]">
                      {f.citation}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {findings.length > 3 && (
              <li className="text-ink-500 italic pl-3">
                + {findings.length - 3} more
              </li>
            )}
          </ul>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onReviewIssues}
              className="inline-flex items-center gap-1 rounded-md border border-pink-500 bg-white px-2.5 py-1 text-[11px] font-semibold text-pink-700 hover:bg-pink-50 transition-colors"
            >
              <ShieldCheck className="h-3 w-3" />
              Review in Compliance
            </button>
          </div>

          {/* Acknowledge checkbox */}
          <label className="mt-3 flex items-start gap-2 cursor-pointer">
            <button
              type="button"
              onClick={onToggleAck}
              aria-pressed={acknowledged}
              className={
                'mt-0.5 w-4 h-4 border-[1.5px] rounded relative flex-shrink-0 transition-colors ' +
                (acknowledged
                  ? 'bg-amber-500 border-amber-500'
                  : 'border-pink-500 bg-white hover:border-pink-700')
              }
            >
              {acknowledged && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">
                  ✓
                </span>
              )}
            </button>
            <span className="text-[11.5px] text-ink-900 leading-[1.45]">
              <span className="font-semibold">
                I&apos;ve reviewed the issues and accept responsibility
                for label compliance.
              </span>{' '}
              <span className="text-ink-600">
                iLaunchify will record this acknowledgement on the design
                version.
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  )
}

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
