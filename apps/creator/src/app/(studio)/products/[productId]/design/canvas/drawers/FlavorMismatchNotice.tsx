'use client'

// Per-flavor label safety — mismatch notice (Verify) (docs/PER_FLAVOR_LABEL_SAFETY_UX.md).
// Presentational: renders the warnings from `detectFlavorMismatch` inline in the Label & Compliance
// tab. No logic here — Code runs the lint (canvas text × selected flavor pool) and passes the result.

import { AlertTriangle } from 'lucide-react'
import type { FlavorMismatchWarning } from '../lib/flavorMismatch'

function truncate(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function FlavorMismatchNotice({
  warnings,
  activeFlavorName,
}: {
  warnings: FlavorMismatchWarning[]
  activeFlavorName: string
}) {
  if (warnings.length === 0) return null
  return (
    <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-3">
      <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-warning-800">
        <AlertTriangle className="h-4 w-4" />
        Possible wrong-flavor text on the {activeFlavorName} label
      </p>
      <ul className="mt-1.5 space-y-1 text-[12px] text-warning-800">
        {warnings.map((w, i) => (
          <li key={i}>
            “{truncate(w.text)}” mentions <strong>{w.matchedFlavor}</strong>
            {w.kind === 'soi' ? ' (statement of identity)' : ''}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-warning-700">
        Check that this label matches the flavor you&apos;re editing — {activeFlavorName}.
      </p>
    </div>
  )
}
