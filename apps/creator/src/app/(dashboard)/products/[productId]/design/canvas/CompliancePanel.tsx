'use client'

// CompliancePanel — right-side overlay opened from the top-bar COMPLIANCE
// button (DS-55). Runs scanLabelCompliance against the current canvas +
// product context, groups findings by severity, and renders each one with
// a "Find on canvas" jump button when the finding ties back to a tagged
// object.
//
// Why a panel (not a drawer): the left rail drawers are for ADDING things;
// compliance is a READ-and-react surface, so it lives on the opposite side
// — same gestalt the user already has from the selection-aware toolbars.
//
// Re-runs on object:modified and on selection changes so the badge counts
// stay live. No debounce: the scan is pure, in-memory, and O(N) over the
// (small) object list.

import * as React from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  Target,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import {
  scanLabelCompliance,
  findObjectByRef,
  type FabricCanvas,
  type LabelScanResult,
  type ScanFinding,
  type ScanSeverity,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  open: boolean
  onClose: () => void
  productCtx: {
    productName: string
    brandName: string
    allergens: string[]
    bioengineered: boolean
    netQuantity: string | null
  }
}

export function CompliancePanel({ canvas, open, onClose, productCtx }: Props) {
  const [result, setResult] = React.useState<LabelScanResult | null>(null)

  // Re-scan whenever the canvas mutates. The scan is pure so we can run it
  // freely; keeps the counts honest while the user edits.
  React.useEffect(() => {
    if (!canvas || !open) {
      setResult(null)
      return
    }

    function rescan() {
      setResult(scanLabelCompliance(canvas, productCtx))
    }

    rescan()
    canvas.on('object:added', rescan)
    canvas.on('object:removed', rescan)
    canvas.on('object:modified', rescan)
    return () => {
      canvas.off('object:added', rescan)
      canvas.off('object:removed', rescan)
      canvas.off('object:modified', rescan)
    }
  }, [canvas, open, productCtx])

  if (!open) return null

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-[380px] z-30 flex flex-col bg-white border-l border-ink-200 shadow-xl">
      <Header onClose={onClose} result={result} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {result && <Summary result={result} />}
        {result?.findings.length === 0 && <PassState />}
        {result && result.findings.length > 0 && (
          <Findings findings={result.findings} canvas={canvas} />
        )}
        {!result && <LoadingState />}
        <FooterNote />
      </div>
    </aside>
  )
}

// ============================================================================
// Header
// ============================================================================

function Header({
  onClose,
  result,
}: {
  onClose: () => void
  result: LabelScanResult | null
}) {
  return (
    <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3 bg-ink-50">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-pink-600" />
        <h2 className="text-base font-semibold text-ink-900">
          Compliance scan
        </h2>
        {result && <OutcomeChip outcome={result.outcome} />}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close compliance panel"
        className="rounded p-1 text-ink-500 hover:bg-ink-100"
      >
        <X className="h-4 w-4" />
      </button>
    </header>
  )
}

function OutcomeChip({ outcome }: { outcome: LabelScanResult['outcome'] }) {
  if (outcome === 'PASS') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        Pass
      </span>
    )
  }
  if (outcome === 'PASS_WITH_WARNINGS') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
        <AlertTriangle className="h-3 w-3" />
        Warn
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
      <AlertOctagon className="h-3 w-3" />
      Fail
    </span>
  )
}

// ============================================================================
// Summary
// ============================================================================

function Summary({ result }: { result: LabelScanResult }) {
  return (
    <section className="rounded-md border border-ink-200 bg-ink-50/50 p-3">
      <div className="grid grid-cols-3 gap-2">
        <CountTile
          severity="BLOCKING"
          count={result.counts.blocking}
          label="Blocking"
        />
        <CountTile
          severity="WARNING"
          count={result.counts.warning}
          label="Warning"
        />
        <CountTile severity="INFO" count={result.counts.info} label="Info" />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-ink-500">
        <span>
          Last checked {relative(result.scannedAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="h-2.5 w-2.5" />
          Auto-re-scan
        </span>
      </div>
    </section>
  )
}

function CountTile({
  severity,
  count,
  label,
}: {
  severity: ScanSeverity
  count: number
  label: string
}) {
  const styles =
    severity === 'BLOCKING'
      ? count > 0
        ? 'border-red-300 bg-red-50 text-red-700'
        : 'border-ink-200 bg-white text-ink-400'
      : severity === 'WARNING'
        ? count > 0
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-ink-200 bg-white text-ink-400'
        : count > 0
          ? 'border-sky-300 bg-sky-50 text-sky-700'
          : 'border-ink-200 bg-white text-ink-400'

  return (
    <div className={`rounded-md border p-2 text-center ${styles}`}>
      <div className="text-xl font-extrabold tabular-nums leading-none">
        {count}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  )
}

// ============================================================================
// Findings
// ============================================================================

function Findings({
  findings,
  canvas,
}: {
  findings: ScanFinding[]
  canvas: FabricCanvas | null
}) {
  const grouped = {
    BLOCKING: findings.filter((f) => f.severity === 'BLOCKING'),
    WARNING: findings.filter((f) => f.severity === 'WARNING'),
    INFO: findings.filter((f) => f.severity === 'INFO'),
  }

  return (
    <div className="space-y-3">
      {grouped.BLOCKING.length > 0 && (
        <FindingsGroup
          title="Blocking"
          severity="BLOCKING"
          findings={grouped.BLOCKING}
          canvas={canvas}
        />
      )}
      {grouped.WARNING.length > 0 && (
        <FindingsGroup
          title="Warning"
          severity="WARNING"
          findings={grouped.WARNING}
          canvas={canvas}
        />
      )}
      {grouped.INFO.length > 0 && (
        <FindingsGroup
          title="Info"
          severity="INFO"
          findings={grouped.INFO}
          canvas={canvas}
        />
      )}
    </div>
  )
}

function FindingsGroup({
  title,
  severity,
  findings,
  canvas,
}: {
  title: string
  severity: ScanSeverity
  findings: ScanFinding[]
  canvas: FabricCanvas | null
}) {
  return (
    <section>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
        {title}
      </div>
      <ul className="space-y-2">
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} severity={severity} canvas={canvas} />
        ))}
      </ul>
    </section>
  )
}

function FindingCard({
  finding,
  severity,
  canvas,
}: {
  finding: ScanFinding
  severity: ScanSeverity
  canvas: FabricCanvas | null
}) {
  // DS-72c — auto-detected INFO findings get a distinct emerald accent +
  // sparkle icon so the creator immediately sees "the system found this
  // on its own; nothing to do".
  const accent = finding.autoDetected
    ? 'border-emerald-300 bg-emerald-50/50'
    : severity === 'BLOCKING'
      ? 'border-red-200 bg-red-50/40'
      : severity === 'WARNING'
        ? 'border-amber-200 bg-amber-50/40'
        : 'border-sky-200 bg-sky-50/40'

  const Icon = finding.autoDetected
    ? Sparkles
    : severity === 'BLOCKING'
      ? AlertOctagon
      : severity === 'WARNING'
        ? AlertTriangle
        : Info

  const iconColor = finding.autoDetected
    ? 'text-emerald-600'
    : severity === 'BLOCKING'
      ? 'text-red-600'
      : severity === 'WARNING'
        ? 'text-amber-600'
        : 'text-sky-600'

  function handleFind() {
    if (!canvas || !finding.objectRef) return
    const obj = findObjectByRef(canvas, finding.objectRef)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  return (
    <li className={`rounded-md border p-3 ${accent}`}>
      <div className="flex gap-2.5">
        <Icon className={`h-3.5 w-3.5 ${iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-ink-900">
            {finding.title}
          </div>
          <p className="mt-1 text-[11.5px] text-ink-700 leading-[1.45]">
            {finding.detail}
          </p>
          {finding.suggestedFix && (
            <p className="mt-1.5 text-[11px] text-ink-600 leading-[1.4]">
              <span className="font-semibold text-pink-700">Fix:</span>{' '}
              {finding.suggestedFix}
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {finding.citation ? (
              <span className="text-[10px] font-mono text-ink-500">
                {finding.citation}
              </span>
            ) : (
              <span />
            )}
            {finding.objectRef && (
              <button
                type="button"
                onClick={handleFind}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-pink-700 hover:bg-pink-100 transition-colors"
              >
                <Target className="h-3 w-3" />
                Find on canvas
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ============================================================================
// Empty / loading
// ============================================================================

function PassState() {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-4 text-center">
      <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
      <h3 className="mt-2 text-sm font-semibold text-emerald-900">
        All required sections present
      </h3>
      <p className="mt-1.5 text-[11.5px] text-emerald-800 leading-[1.45]">
        Your canvas has every FDA-required label element tagged. Real content +
        per-rule-pack checks still run on print/export.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50 p-4 text-center">
      <RefreshCw className="mx-auto h-5 w-5 text-ink-400 animate-spin" />
      <p className="mt-2 text-[11.5px] text-ink-500">Scanning canvas…</p>
    </div>
  )
}

function FooterNote() {
  return (
    <section className="rounded-md border border-pink-200 bg-pink-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-pink-700">
        Pre-print check · not a substitute for legal review
      </div>
      <p className="mt-1 text-[11px] text-ink-700 leading-[1.45]">
        This scan covers structural label requirements (21 CFR §101). Final
        compliance — including market-specific rules and FDA correspondence —
        is your responsibility. Add the FDA Standard Nutrition Panel via the
        Label drawer for the most reliable result.
      </p>
    </section>
  )
}

// ============================================================================
// Util
// ============================================================================

function relative(d: Date): string {
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  return `${mins}m ago`
}
