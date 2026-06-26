import { FileWarning } from 'lucide-react'

// Die-line label-frame checkout banner (DIELINE_FRAME_EDITOR_SPEC §5).
//
// Renders when the product's packaging die-line declares required label frames
// (Nutrition Facts, Ingredients, Allergens, …) and the saved design is missing
// one. The order is HARD-blocked server-side (placeOrderFromCheckoutDraft); this
// banner explains exactly which elements to add. Presentational only — the
// issues are computed server-side by loadProductLabelCompliance.

export interface LabelFrameIssue {
  kind: string
  message: string
}

export function LabelComplianceNotice({ issues }: { issues: LabelFrameIssue[] }) {
  if (issues.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-warning-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">
            This label is missing required elements
          </p>
          <p className="text-[12px] leading-relaxed text-warning-800">
            Your packaging requires the elements below on the printed label.
            Open the Design Studio and add them, then come back to order.
          </p>
          <ul className="space-y-1.5">
            {issues.map((i) => (
              <li key={i.kind} className="text-[12px] leading-relaxed">
                <span className="text-warning-800">{i.message}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] italic text-warning-700/80">
            This is a pre-flight check, not legal advice. iLaunchify&rsquo;s
            compliance tooling is assistive and does not replace your own review.
          </p>
        </div>
      </div>
    </div>
  )
}
