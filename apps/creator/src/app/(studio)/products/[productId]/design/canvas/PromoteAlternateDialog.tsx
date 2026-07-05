'use client'

// PromoteAlternateDialog — versioning v2 §4.3, decision locked 2026-07-05:
// promote = CONFIRM + SNAPSHOT. Always allowed; this dialog states the
// consequences, the server pins the outgoing Active as a PROMOTION version
// (reversible from history) and writes AuditLog. In-flight orders keep their
// locked DesignVersions regardless. Published products get an extra warning
// line — no re-approval gate in V1.

import * as React from 'react'
import { Crown, Loader2, TriangleAlert, X } from 'lucide-react'

export function PromoteAlternateDialog({
  open,
  alternateName,
  slotLabel,
  productPublished,
  promoting,
  onConfirm,
  onClose,
}: {
  open: boolean
  /** Display name of the design being promoted, e.g. "Bold v2". */
  alternateName: string
  /** The slot it becomes Active for, e.g. "Chocolate · Front label". */
  slotLabel: string | null
  /** True when Product.status === 'PUBLISHED' — adds the warning line. */
  productPublished: boolean
  promoting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-[20vh]" role="dialog" aria-modal="true" aria-label="Make this design Active">
      <div className="absolute inset-0 bg-ink-900/30" onClick={onClose} />
      <div className="relative w-[440px] max-w-[92vw] rounded-2xl border border-ink-200 bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-50 text-pink-600">
              <Crown className="h-3.5 w-3.5" />
            </span>
            <div className="font-display text-[14px] font-semibold text-ink-900">Make “{alternateName}” Active?</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
          It becomes the production design{slotLabel ? <> for <span className="font-semibold text-ink-900">{slotLabel}</span></> : null} —
          used for preview, export and every new order. The current Active design is saved as a named
          version, so you can always switch back from Version history.
        </p>

        {productPublished && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] leading-relaxed text-warning-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This product is <span className="font-semibold">published</span> — new orders start producing this design. Orders already in production are not affected.</span>
          </div>
        )}

        <div className="mt-3.5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-ink-600 transition-colors hover:bg-ink-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={promoting}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {promoting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Make Active
          </button>
        </div>
      </div>
    </div>
  )
}
