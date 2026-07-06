import { Printer } from 'lucide-react'

// PS-8 coverage-paused checkout banner (docs/HANDOFF-TO-CODE-coverage-guard-copy.md).
//
// Renders when this product's template was auto-PAUSED after losing all print
// coverage and still has an OPEN/CLAIMED capability RFQ (the nightly sweep
// re-broadcasts to line up a new printer). Reassuring + non-blocking in tone:
// the creator keeps their draft, but Pay is held. The order is also HARD-blocked
// server-side by the §8 UNRESOLVED validator; this friendly copy comes first.
// Presentational only — the flag is computed server-side in page.tsx.

export function CoveragePausedNotice() {
  return (
    <div
      role="status"
      className="rounded-xl border border-info-300 bg-info-50 p-4 text-info-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <Printer className="mt-0.5 h-5 w-5 shrink-0 text-info-600" aria-hidden="true" />
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold">
            Printing for this product is being re-arranged
          </p>
          <p className="text-[12px] leading-relaxed text-info-800">
            Ordering is paused for a moment while we line up a printer. Your
            checkout is saved — we&rsquo;ll email you the moment it&rsquo;s back.
          </p>
        </div>
      </div>
    </div>
  )
}
