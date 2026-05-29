'use client'

// Step 1 — Review design (G2).
//
// Three blocks:
//   1. Design preview — read-only Fabric.js canvas mounted at thumb
//      size, scrollable container if the die-cut is large. Falls back
//      to an empty placeholder when the creator hasn't saved a design
//      yet.
//   2. Automated checklist — surfaces three signals from
//      loadReviewSnapshot:
//        • empty / placeholder text objects in the saved JSON
//        • last persisted compliance scan result (from
//          generationMeta.complianceAckHistory)
//        • design freshness (when the design was last saved)
//   3. Manual sign-off — three checkboxes that gate the Next button.
//      All three must be ticked. The wizard disables Next until then.
//      "Edit design" bounces back to the canvas; "I'm satisfied" stays.
//
// 3D preview / structural compliance re-scan are V1.5+. The canvas-side
// scanLabelCompliance() needs a live Fabric instance and we already
// surface the latest result here from generationMeta.

import { useEffect, useRef, useState } from 'react'
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
    import('./DesignPreviewCanvas').then(
      (m) => m.DesignPreviewCanvas,
    ),
  { ssr: false, loading: () => <PreviewSkeleton /> },
)

export function ReviewStep({ productId, state, onChange, snapshot }: Props) {
  // Treat the per-finding checks as a derived view; they don't need state.
  const findings = computeFindings(snapshot)
  const blockingCount = findings.filter((f) => f.severity === 'blocking').length

  return (
    <StepShell
      index={1}
      title="Review your design"
      subtitle="One last look before you commit to a production run."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr),320px]">
        {/* Left — preview */}
        <section className="space-y-3">
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
                  Design preview
                </h3>
                {snapshot.exists && snapshot.designVersion && (
                  <p className="text-[12.5px] text-ink-700">
                    Version {snapshot.designVersion}
                    {snapshot.designUpdatedAt && (
                      <span className="text-ink-500">
                        {' '}
                        · saved {formatRelative(snapshot.designUpdatedAt)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <Link
                href={`/products/${productId}/design/canvas`}
                onClick={() => onChange({ bouncedToCanvas: true })}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-700 hover:bg-ink-50"
              >
                <Edit3 className="h-3 w-3" />
                Edit design
              </Link>
            </header>
            {snapshot.exists && snapshot.fabricJson && snapshot.dieCut ? (
              <DesignPreviewCanvas
                fabricJson={snapshot.fabricJson}
                dieCut={snapshot.dieCut}
              />
            ) : (
              <EmptyPreview productId={productId} />
            )}
          </div>
        </section>

        {/* Right — checklist + acks */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-white p-4">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-ink-500">
              Auto-checked
            </h3>
            <ul className="mt-2 space-y-2">
              {findings.length === 0 ? (
                <li className="flex items-start gap-2 text-sm text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>No automatic issues found in the saved design.</span>
                </li>
              ) : (
                findings.map((f) => (
                  <li key={f.id} className="flex items-start gap-2">
                    {iconFor(f.severity)}
                    <div className="min-w-0">
                      <p
                        className={
                          'text-[12.5px] font-semibold ' +
                          (f.severity === 'blocking'
                            ? 'text-red-800'
                            : f.severity === 'warning'
                              ? 'text-amber-800'
                              : 'text-ink-700')
                        }
                      >
                        {f.title}
                      </p>
                      <p className="text-[11.5px] leading-snug text-ink-600">
                        {f.detail}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
            {blockingCount > 0 && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
                You can still proceed by acknowledging risk, but partners may
                push back when they review. Click <strong>Edit design</strong>{' '}
                to fix these before continuing.
              </p>
            )}
          </div>

          <SignOffPanel state={state} onChange={onChange} />
        </aside>
      </div>
    </StepShell>
  )
}

// =============================================================================
// SignOffPanel — the three checkboxes that gate Next
// =============================================================================

function SignOffPanel({
  state,
  onChange,
}: {
  state: ReviewState
  onChange: (patch: Partial<ReviewState>) => void
}) {
  const all =
    state.ackDesignFinal &&
    state.ackProductionReady &&
    state.ackComplianceReviewed
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (all
          ? 'border-emerald-300 bg-emerald-50/40'
          : 'border-pink-200 bg-pink-50/40')
      }
    >
      <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-pink-700">
        <ShieldCheck className="h-3 w-3" />
        Confirm before continuing
      </h3>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-700">
        Three quick sign-offs so we know you&apos;re committing to this exact
        artwork.
      </p>
      <ul className="mt-3 space-y-2">
        <AckCheckbox
          label="My design is final — I&apos;ve reviewed every text block."
          checked={state.ackDesignFinal}
          onToggle={() => onChange({ ackDesignFinal: !state.ackDesignFinal })}
        />
        <AckCheckbox
          label="I&apos;m comfortable with the FDA-compliance results above."
          checked={state.ackComplianceReviewed}
          onToggle={() =>
            onChange({ ackComplianceReviewed: !state.ackComplianceReviewed })
          }
        />
        <AckCheckbox
          label="This artwork is print-ready — no further canvas edits."
          checked={state.ackProductionReady}
          onToggle={() =>
            onChange({ ackProductionReady: !state.ackProductionReady })
          }
        />
      </ul>
    </div>
  )
}

function AckCheckbox({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          className={
            'relative mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[1.5px] transition-colors ' +
            (checked
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-ink-400 bg-white hover:border-pink-500')
          }
        >
          {checked && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
              ✓
            </span>
          )}
        </button>
        <span
          className="text-[12px] leading-snug text-ink-900"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: label }}
        />
      </label>
    </li>
  )
}

// =============================================================================
// Findings — derive the checklist rows from the server snapshot
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

  // Text content scan
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
  } else if (snapshot.text.totalTextObjects > 0) {
    out.push({
      id: 'text-ok',
      severity: 'ok',
      title: `${snapshot.text.totalTextObjects} text block${snapshot.text.totalTextObjects === 1 ? '' : 's'} look complete`,
      detail: 'No empty or placeholder strings in the saved design.',
    })
  }

  // Compliance recap
  if (!snapshot.compliance.everScanned) {
    out.push({
      id: 'no-compliance-scan',
      severity: 'warning',
      title: 'Compliance scan hasn&apos;t run yet',
      detail:
        'Open the Studio and run the COMPLIANCE check, or skip — partners may flag missing FDA elements.',
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
  } else {
    out.push({
      id: 'compliance-clean',
      severity: 'ok',
      title: 'Compliance scan clean',
      detail:
        snapshot.compliance.lastAckAt
          ? `Last verified ${formatRelative(snapshot.compliance.lastAckAt)}.`
          : 'No blocking findings on the last scan.',
    })
  }

  return out
}

function iconFor(severity: ReviewFinding['severity']) {
  const cls = 'mt-0.5 h-4 w-4 flex-shrink-0'
  if (severity === 'blocking')
    return <AlertOctagon className={`${cls} text-red-700`} />
  if (severity === 'warning')
    return <FileWarning className={`${cls} text-amber-700`} />
  if (severity === 'ok')
    return <CheckCircle2 className={`${cls} text-emerald-700`} />
  return <Info className={`${cls} text-ink-500`} />
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
