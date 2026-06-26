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
import { ShieldCheck, Plus, AlertTriangle as AlertTriangleIcon, Target as TargetIcon } from 'lucide-react'
import {
  scanLabelCompliance,
  findObjectByRef,
  certBadgeIdsOnCanvas,
  findCertBadgeObject,
  type FabricCanvas,
  type LabelScanResult,
  type ScanFinding,
  type ScanSeverity,
  type FrameLayout,
  type ComplianceContext,
  type ComplianceReport,
  type FrameCheck,
} from '@ilaunchify/ui'
import type { CertBadge } from './cert-badge-actions'
import { findClearSpaceViolations, type ClearSpaceViolation } from './clearSpace'
import {
  runFrameComplianceFromCanvas,
  selectObjectForKind,
  type FrameDims,
} from './frameComplianceCanvas'

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
    lockedPhrases?: Array<{
      id: string
      slug: string
      title: string
      body: string
      citation?: string | null
    }>
  }
  /** Verified certs available to this product (for the "unused claims" nudge). */
  certBadges?: CertBadge[]
  /** Request to add a cert (routes through the shell's consent gate). */
  onAddCert?: (badge: CertBadge) => void
  /** Die-line frame layout for this product (null when no die-line). */
  frameLayout?: FrameLayout | null
  /** Frame composition context incl. currentRecipeHash + safeAreaBySurface. */
  frameCtx?: ComplianceContext | null
  /** Trim geometry to map live object boxes into frame-normalized space. */
  frameDims?: FrameDims | null
}

export function CompliancePanel({
  canvas,
  open,
  onClose,
  productCtx,
  certBadges = [],
  onAddCert,
  frameLayout,
  frameCtx,
  frameDims,
}: Props) {
  const [result, setResult] = React.useState<LabelScanResult | null>(null)
  // Which cert instances are currently on the canvas — drives the unused list.
  const [placedCertIds, setPlacedCertIds] = React.useState<Set<string>>(new Set())
  const [clearSpace, setClearSpace] = React.useState<ClearSpaceViolation[]>([])
  // Die-line frame gate run off live canvas coords — null when no die-line.
  const [frameReport, setFrameReport] = React.useState<ComplianceReport | null>(null)

  // Re-scan whenever the canvas mutates. The scan is pure so we can run it
  // freely; keeps the counts honest while the user edits.
  React.useEffect(() => {
    if (!canvas || !open) {
      setResult(null)
      return
    }

    function rescan() {
      if (!canvas) return
      setResult(scanLabelCompliance(canvas, productCtx))
      setPlacedCertIds(certBadgeIdsOnCanvas(canvas))
      setClearSpace(findClearSpaceViolations(canvas))
      setFrameReport(runFrameComplianceFromCanvas(canvas, frameLayout, frameCtx, frameDims))
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
  }, [canvas, open, productCtx, frameLayout, frameCtx, frameDims])

  // Verified certs with art that aren't on the label yet — an opt-in nudge.
  const unusedCerts = certBadges.filter(
    (b) => b.badgeUrl && !placedCertIds.has(b.certInstanceId),
  )

  if (!open) return null

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-[380px] z-30 flex flex-col bg-white border-l border-ink-200 shadow-xl">
      <Header onClose={onClose} result={result} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {result && <Summary result={result} />}
        {frameReport && frameReport.checks.length > 0 && (
          <FrameComplianceSection report={frameReport} canvas={canvas} />
        )}
        {result?.findings.length === 0 && <PassState />}
        {result && result.findings.length > 0 && (
          <Findings findings={result.findings} canvas={canvas} />
        )}
        {!result && <LoadingState />}
        {clearSpace.length > 0 && (
          <ClearSpaceWarnings violations={clearSpace} certBadges={certBadges} canvas={canvas} />
        )}
        {unusedCerts.length > 0 && (
          <AvailableCertifications certs={unusedCerts} onAddCert={onAddCert} />
        )}
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
      <span className="inline-flex items-center gap-1 rounded-full bg-success-100 text-success-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        Pass
      </span>
    )
  }
  if (outcome === 'PASS_WITH_WARNINGS') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 text-warning-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
        <AlertTriangle className="h-3 w-3" />
        Warn
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 text-danger-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
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
        ? 'border-danger-300 bg-danger-50 text-danger-700'
        : 'border-ink-200 bg-white text-ink-400'
      : severity === 'WARNING'
        ? count > 0
          ? 'border-warning-300 bg-warning-50 text-warning-700'
          : 'border-ink-200 bg-white text-ink-400'
        : count > 0
          ? 'border-info-300 bg-info-50 text-info-700'
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
      <div className="text-[12px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">
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
    ? 'border-success-300 bg-success-50/50'
    : severity === 'BLOCKING'
      ? 'border-danger-200 bg-danger-50/40'
      : severity === 'WARNING'
        ? 'border-warning-200 bg-warning-50/40'
        : 'border-info-200 bg-info-50/40'

  const Icon = finding.autoDetected
    ? Sparkles
    : severity === 'BLOCKING'
      ? AlertOctagon
      : severity === 'WARNING'
        ? AlertTriangle
        : Info

  const iconColor = finding.autoDetected
    ? 'text-success-600'
    : severity === 'BLOCKING'
      ? 'text-danger-600'
      : severity === 'WARNING'
        ? 'text-warning-600'
        : 'text-info-600'

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
// Die-line frames — placement gate run off live canvas coords (presence +
// safe-area bounds + recipe freshness). Mirrors the server checkout gate so the
// creator fixes issues here before they hit "Pay". OUT_OF_BOUNDS / STALE catch
// the cases presence alone can't: an element dragged off-spec or left stale.
// ============================================================================

function humanFrameKind(k: string): string {
  return k
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function FrameComplianceSection({
  report,
  canvas,
}: {
  report: ComplianceReport
  canvas: FabricCanvas | null
}) {
  const failing = report.checks.filter((c) => c.status === 'fail')
  const passing = report.checks.length - failing.length

  return (
    <section className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-700">
          <Target className="h-3 w-3" />
          Die-line frames
        </div>
        {report.status === 'pass' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-100 text-success-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3" />
            All placed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-100 text-danger-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
            <AlertOctagon className="h-3 w-3" />
            {failing.length} to fix
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-ink-600 leading-[1.45]">
        Every required slot on this product&apos;s die-line must hold its element,
        inside the safe area, matching the current recipe.{' '}
        {passing > 0 && (
          <span className="text-ink-500">{passing} slot{passing === 1 ? '' : 's'} OK.</span>
        )}
      </p>
      {failing.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {failing.map((check) => (
            <FrameCheckRow key={check.frameId} check={check} canvas={canvas} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FrameCheckRow({
  check,
  canvas,
}: {
  check: FrameCheck
  canvas: FabricCanvas | null
}) {
  // MISSING means nothing to jump to; OUT_OF_BOUNDS / STALE have a placed object.
  const hasObject = check.issues.every((i) => i.code !== 'MISSING')
  return (
    <li className="rounded-md border border-danger-200 bg-danger-50/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink-900">
            {humanFrameKind(check.kind)}
          </div>
          {check.issues.map((issue) => (
            <p key={issue.code} className="mt-0.5 text-[11px] text-ink-700 leading-[1.4]">
              {issue.message}
            </p>
          ))}
        </div>
        {hasObject && (
          <button
            type="button"
            onClick={() => selectObjectForKind(canvas, check.kind)}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-danger-700 hover:bg-danger-100"
          >
            <Target className="h-3 w-3" /> Find
          </button>
        )}
      </div>
    </li>
  )
}

// ============================================================================
// Empty / loading
// ============================================================================

function PassState() {
  return (
    <div className="rounded-md border border-success-200 bg-success-50/50 p-4 text-center">
      <CheckCircle2 className="mx-auto h-7 w-7 text-success-600" />
      <h3 className="mt-2 text-sm font-semibold text-success-900">
        All required sections present
      </h3>
      <p className="mt-1.5 text-[11.5px] text-success-800 leading-[1.45]">
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

// ============================================================================
// Clear-space warnings — objects intruding a badge's clear-space zone (C8)
// ============================================================================

function ClearSpaceWarnings({
  violations,
  certBadges,
  canvas,
}: {
  violations: ClearSpaceViolation[]
  certBadges: CertBadge[]
  canvas: FabricCanvas | null
}) {
  const nameFor = (id: string) =>
    certBadges.find((b) => b.certInstanceId === id)?.certTypeName ?? 'certification'

  function find(certInstanceId: string) {
    if (!canvas) return
    const obj = findCertBadgeObject(canvas, certInstanceId)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  }

  return (
    <section className="rounded-md border border-warning-200 bg-warning-50/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning-700">
        <AlertTriangleIcon className="h-3 w-3" />
        Clear-space
      </div>
      <p className="mt-1 text-[11px] text-ink-600 leading-[1.45]">
        Certification marks need a clear margin around them. Move overlapping elements away to
        stay on-spec.
      </p>
      <ul className="mt-2 space-y-1.5">
        {violations.map((v) => (
          <li
            key={v.certInstanceId}
            className="flex items-center justify-between gap-2 rounded-md border border-warning-200 bg-white px-2.5 py-1.5"
          >
            <span className="min-w-0 text-[12px] text-ink-800">
              <span className="font-semibold">{nameFor(v.certInstanceId)}</span>{' '}
              <span className="text-ink-500">
                — {v.intruders} element{v.intruders === 1 ? '' : 's'} too close
              </span>
            </span>
            <button
              type="button"
              onClick={() => find(v.certInstanceId)}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-warning-800 hover:bg-warning-100"
            >
              <TargetIcon className="h-3 w-3" /> Find
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ============================================================================
// Available certifications — unused verified claims nudge (C8 part 7)
// ============================================================================

function AvailableCertifications({
  certs,
  onAddCert,
}: {
  certs: CertBadge[]
  onAddCert?: (badge: CertBadge) => void
}) {
  return (
    <section className="rounded-md border border-success-200 bg-success-50/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-success-700">
        <ShieldCheck className="h-3 w-3" />
        Available certifications
      </div>
      <p className="mt-1 text-[11px] text-ink-600 leading-[1.45]">
        {certs.length} verified {certs.length === 1 ? 'certification is' : 'certifications are'} ready
        to display but not on your label yet. Add them — you&apos;ll confirm each claim first.
      </p>
      <ul className="mt-2 space-y-1.5">
        {certs.map((c) => (
          <li
            key={c.certInstanceId}
            className="flex items-center justify-between gap-2 rounded-md border border-success-200 bg-white px-2.5 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.badgeUrl!}
                alt=""
                className="h-6 w-6 flex-shrink-0 rounded border border-ink-200 bg-white object-contain p-0.5"
              />
              <span className="truncate text-[12px] font-semibold text-ink-900">{c.certTypeName}</span>
            </span>
            <button
              type="button"
              onClick={() => onAddCert?.(c)}
              disabled={!onAddCert}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-success-600 px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-success-700 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </li>
        ))}
      </ul>
    </section>
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
