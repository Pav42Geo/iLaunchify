'use client'

// REBUILD R8.b — Step 1 · Review your design.
//
// Rebuilt from the older G2 three-checkbox shell. New shape:
//   - Vistaprint-style surface tab strip (Front · Back) — Back is
//     a "Coming soon" stub for V1 per Pavel's confirmation.
//   - Front surface renders the saved Fabric.js JSON as a 2D
//     read-only preview via the existing DesignPreviewCanvas
//     (mounts a tiny Fabric instance with selection disabled).
//   - Compliance report card (last persisted scan from
//     generationMeta.complianceAckHistory).
//   - Short design report card (text-block counts, placeholders).
//   - Single "I have reviewed and approve my design" checkbox.
//     The three older sign-offs collapse to one — Pavel asked for
//     a Vistaprint-style single agreement.
//   - Modern action buttons in a consistent right-rail position:
//     primary Continue to production · secondary Edit my design.
//     The wizard's footer still owns the underlying Next state.

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  Edit3,
  FileWarning,
  Info,
  ShieldCheck,
} from 'lucide-react'
import { StepShell } from './_StepShell'
import type { ReviewState } from '../types'
import type { ReviewSnapshot } from '../review-actions'

interface Props {
  productId: string
  state: ReviewState
  onChange: (patch: Partial<ReviewState>) => void
  snapshot: ReviewSnapshot
}

// Fabric needs window — load the preview client-side only.
const DesignPreviewCanvas = dynamic(
  () =>
    import('./DesignPreviewCanvas').then((m) => m.DesignPreviewCanvas),
  { ssr: false, loading: () => <PreviewSkeleton /> },
)

type Surface = 'front' | 'back'

export function ReviewStep({ productId, state, onChange, snapshot }: Props) {
  // V1: only Front renders real Fabric content. Back is a placeholder
  // tab that surfaces "Coming soon" so the multi-surface affordance
  // is visible without committing to render code yet.
  const [surface, setSurface] = useState<Surface>('front')
  const findings = computeFindings(snapshot)
  const blockingCount = findings.filter((f) => f.severity === 'blocking').length
  const complianceClean =
    snapshot.exists &&
    snapshot.compliance.everScanned &&
    snapshot.compliance.blockingFindingCount === 0
  const editHref = `/products/${productId}/design/canvas`

  return (
    <StepShell
      index={1}
      title="Review your design"
      subtitle="Double-check the details before you commit to production."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),360px]">
        {/* Left — preview + surface tabs */}
        <section className="space-y-3">
          <div className="rounded-xl border border-ink-200 bg-white">
            <SurfaceTabs surface={surface} onChange={setSurface} />

            <div className="p-4">
              <header className="mb-3 flex items-center justify-between text-[12px]">
                <div>
                  {snapshot.exists && snapshot.designVersion ? (
                    <>
                      <span className="font-medium text-ink-900">
                        Version {snapshot.designVersion}
                      </span>
                      {snapshot.designUpdatedAt && (
                        <span className="text-ink-500">
                          {' '}
                          · saved {formatRelative(snapshot.designUpdatedAt)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-500">No saved design yet</span>
                  )}
                </div>
                {/* Front surface only renders a real preview for V1. The
                    multi-surface 3D + back-of-pack preview is V1.1. */}
                {surface === 'front' ? (
                  snapshot.exists && snapshot.fabricJson && snapshot.dieCut ? (
                    <span className="text-[11px] text-ink-500">
                      Front · {mmToIn(snapshot.dieCut.widthMm)}″ ×{' '}
                      {mmToIn(snapshot.dieCut.heightMm)}″
                    </span>
                  ) : null
                ) : (
                  <span className="text-[11px] text-ink-500">
                    Back surface · preview coming in V1.1
                  </span>
                )}
              </header>

              {surface === 'front' ? (
                snapshot.exists && snapshot.fabricJson && snapshot.dieCut ? (
                  <DesignPreviewCanvas
                    fabricJson={snapshot.fabricJson}
                    dieCut={snapshot.dieCut}
                  />
                ) : (
                  <EmptyPreview productId={productId} />
                )
              ) : (
                <BackSurfacePlaceholder />
              )}
            </div>
          </div>
        </section>

        {/* Right — reports + sign-off + actions */}
        <aside className="space-y-4">
          <ReportCard title="Compliance report" status={complianceClean ? 'ok' : 'warn'}>
            {!snapshot.exists ? (
              <p className="text-[12px] text-ink-600">
                Save a design first so we can scan it.
              </p>
            ) : !snapshot.compliance.everScanned ? (
              <p className="text-[12px] text-ink-600">
                The Studio compliance check hasn&apos;t run on this version yet.
                Re-open the Studio if you want a fresh scan.
              </p>
            ) : snapshot.compliance.blockingFindingCount > 0 ? (
              <p className="text-[12px] text-ink-700">
                <strong className="font-semibold text-amber-800">
                  {snapshot.compliance.blockingFindingCount} blocking{' '}
                  {snapshot.compliance.blockingFindingCount === 1
                    ? 'issue'
                    : 'issues'}
                </strong>{' '}
                from the last scan
                {snapshot.compliance.lastAcknowledged
                  ? ' — you acknowledged these on export.'
                  : ' — open the Studio compliance panel to address them.'}
              </p>
            ) : (
              <p className="text-[12px] text-emerald-700">
                No blocking issues on the last scan
                {snapshot.compliance.lastAckAt
                  ? ` (verified ${formatRelative(snapshot.compliance.lastAckAt)})`
                  : ''}
                .
              </p>
            )}
          </ReportCard>

          <ReportCard
            title="Design report"
            status={
              snapshot.exists && snapshot.text.emptyOrPlaceholderCount === 0
                ? 'ok'
                : 'warn'
            }
          >
            {!snapshot.exists ? (
              <p className="text-[12px] text-ink-600">No content to summarise yet.</p>
            ) : (
              <ul className="space-y-1.5 text-[12px] text-ink-700">
                <li className="flex items-center justify-between">
                  <span>Text blocks</span>
                  <span className="tabular-nums">{snapshot.text.totalTextObjects}</span>
                </li>
                <li
                  className={
                    'flex items-center justify-between ' +
                    (snapshot.text.emptyOrPlaceholderCount > 0
                      ? 'text-amber-800'
                      : '')
                  }
                >
                  <span>Empty or placeholder</span>
                  <span className="tabular-nums">
                    {snapshot.text.emptyOrPlaceholderCount}
                  </span>
                </li>
                {findings.some((f) => f.severity === 'blocking' && f.id === 'placeholder-text') && (
                  <li className="pt-1 text-[11.5px] leading-snug text-amber-800">
                    Resolve placeholder text in the Studio before production runs.
                  </li>
                )}
              </ul>
            )}
          </ReportCard>

          {blockingCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
              <AlertOctagon className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                You can still continue, but partners may push back during their
                review. Editing the design now usually keeps things moving faster.
              </span>
            </div>
          )}

          <ApprovalCard state={state} onChange={onChange} />

          <ActionRail editHref={editHref} onEditClick={() => onChange({ bouncedToCanvas: true })} />
        </aside>
      </div>
    </StepShell>
  )
}

// =============================================================================
// SurfaceTabs — Front (active) · Back (Coming soon)
// =============================================================================

function SurfaceTabs({
  surface,
  onChange,
}: {
  surface: Surface
  onChange: (s: Surface) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Packaging surface"
      className="flex gap-1 border-b border-ink-200 px-4 pt-3"
    >
      <Tab
        active={surface === 'front'}
        label="Front"
        onClick={() => onChange('front')}
      />
      <Tab
        active={surface === 'back'}
        label="Back"
        soonBadge
        onClick={() => onChange('back')}
      />
    </div>
  )
}

function Tab({
  active,
  label,
  onClick,
  soonBadge,
}: {
  active: boolean
  label: string
  onClick: () => void
  soonBadge?: boolean
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors ' +
        (active
          ? 'border-ink-900 text-ink-900'
          : 'border-transparent text-ink-500 hover:text-ink-700')
      }
    >
      {label}
      {soonBadge && (
        <span className="rounded-full bg-ink-100 px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wider text-ink-600">
          Soon
        </span>
      )}
    </button>
  )
}

// =============================================================================
// ReportCard
// =============================================================================

function ReportCard({
  title,
  status,
  children,
}: {
  title: string
  status: 'ok' | 'warn'
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        {status === 'ok' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
        ) : (
          <FileWarning className="h-3.5 w-3.5 text-amber-700" />
        )}
        <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
          {title}
        </h3>
      </header>
      {children}
    </div>
  )
}

// =============================================================================
// ApprovalCard — single "I approve my design" checkbox
// =============================================================================

function ApprovalCard({
  state,
  onChange,
}: {
  state: ReviewState
  onChange: (patch: Partial<ReviewState>) => void
}) {
  // R8.b collapses the older three-ack model into one — Pavel asked
  // for Vistaprint's "I have reviewed and approve my design" pattern.
  // We reuse ackDesignFinal as the single source of truth so the
  // wizard's Next-gate (which already checks this field) keeps working
  // without state-schema migration.
  //
  // R9.c — uses role="checkbox" + Space/Enter key handling so screen
  // readers announce this as a checkbox, not a generic button. The
  // visible "checkbox" remains a styled <span> sibling because we
  // need free control of the colour transition.
  const approved = state.ackDesignFinal
  const labelId = 'review-approve-label'
  const descId = 'review-approve-desc'
  function toggle() {
    onChange({
      ackDesignFinal: !approved,
      ackProductionReady: !approved,
      ackComplianceReviewed: !approved,
    })
  }
  return (
    <div
      role="checkbox"
      aria-checked={approved}
      aria-labelledby={labelId}
      aria-describedby={descId}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }}
      className={
        'group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ' +
        (approved
          ? 'border-emerald-300 bg-emerald-50/60'
          : 'border-pink-200 bg-pink-50/40 hover:border-pink-300')
      }
    >
      <span
        aria-hidden="true"
        className={
          'relative mt-0.5 h-5 w-5 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
          (approved
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-ink-400 bg-white group-hover:border-pink-500')
        }
      >
        {approved && (
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-white">
            ✓
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p
          id={labelId}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-900"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-pink-700" aria-hidden="true" />
          I have reviewed and approve my design
        </p>
        <p id={descId} className="mt-1 text-[11.5px] leading-snug text-ink-600">
          Once you continue, this exact artwork is what your partners produce.
          You can still edit before placing the order.
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// ActionRail — consistent right-rail action area per checkout step
// =============================================================================

function ActionRail({
  editHref,
  onEditClick,
}: {
  editHref: string
  onEditClick: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={editHref}
        onClick={onEditClick}
        className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-[12px] font-medium text-ink-900 hover:bg-ink-50"
      >
        <Edit3 className="h-3.5 w-3.5" />
        Edit my design
      </Link>
      <p className="text-center text-[11px] text-ink-500">
        Tick approval above, then use <strong>Continue to production</strong> in
        the footer.
      </p>
    </div>
  )
}

// =============================================================================
// Findings — derive the design report from the server snapshot
// =============================================================================

interface ReviewFinding {
  id: string
  severity: 'blocking' | 'warning' | 'info' | 'ok'
  title: string
  detail: string
}

function computeFindings(snapshot: ReviewSnapshot): ReviewFinding[] {
  const out: ReviewFinding[] = []
  if (!snapshot.exists) {
    out.push({
      id: 'no-design',
      severity: 'blocking',
      title: 'No saved design yet',
      detail:
        'Open the Design Studio and save your label artwork before checking out.',
    })
    return out
  }
  if (snapshot.text.emptyOrPlaceholderCount > 0) {
    const samples = snapshot.text.samples.slice(0, 3).join(' · ')
    out.push({
      id: 'placeholder-text',
      severity: 'blocking',
      title: `${snapshot.text.emptyOrPlaceholderCount} text block${snapshot.text.emptyOrPlaceholderCount === 1 ? '' : 's'} look like placeholders`,
      detail: samples
        ? `Example${snapshot.text.emptyOrPlaceholderCount === 1 ? '' : 's'}: ${samples}`
        : 'Empty or placeholder text strings detected.',
    })
  }
  if (!snapshot.compliance.everScanned) {
    out.push({
      id: 'no-compliance-scan',
      severity: 'warning',
      title: 'Compliance scan has not run yet',
      detail:
        'Re-open the Studio to run COMPLIANCE, or skip — partners may flag missing FDA elements.',
    })
  } else if (snapshot.compliance.blockingFindingCount > 0) {
    out.push({
      id: 'compliance-unresolved',
      severity: snapshot.compliance.lastAcknowledged ? 'warning' : 'blocking',
      title: `${snapshot.compliance.blockingFindingCount} compliance issue${snapshot.compliance.blockingFindingCount === 1 ? '' : 's'} on last scan`,
      detail: snapshot.compliance.lastAcknowledged
        ? 'You acknowledged these during export. Re-run the scan to clear them.'
        : 'Open the Studio compliance panel to address them before partners review.',
    })
  }
  return out
}

// =============================================================================
// Misc
// =============================================================================

function PreviewSkeleton() {
  return (
    <div className="flex h-72 items-center justify-center rounded-md bg-ink-100/60 text-[11.5px] text-ink-500">
      <Clock className="mr-1.5 h-3 w-3" /> Loading preview…
    </div>
  )
}

function EmptyPreview({ productId }: { productId: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center rounded-md border border-dashed border-ink-300 bg-ink-50/40 text-center">
      <p className="text-sm font-medium text-ink-700">No design saved yet</p>
      <p className="mt-1 max-w-xs text-[11.5px] text-ink-500">
        Pop into the Design Studio, build your label, and save — then come back
        here to finish the order.
      </p>
      <Link
        href={`/products/${productId}/design/canvas`}
        className="mt-3 inline-flex items-center rounded-full bg-ink-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-black"
      >
        Open Design Studio
      </Link>
    </div>
  )
}

function BackSurfacePlaceholder() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-300 bg-ink-50/40 text-center">
      <Info className="h-4 w-4 text-ink-400" />
      <p className="text-sm font-medium text-ink-700">Back surface — coming in V1.1</p>
      <p className="max-w-xs text-[11.5px] text-ink-500">
        We&apos;ll render the back panel preview (ingredients, nutrition, barcode)
        here once the multi-surface canvas ships.
      </p>
    </div>
  )
}

function mmToIn(mm: number | null | undefined): string {
  if (mm == null) return '—'
  return (mm / 25.4).toFixed(2)
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return new Date(iso).toLocaleDateString()
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
