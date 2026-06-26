import { ShieldAlert } from 'lucide-react'
import type { RestrictionHit } from '@ilaunchify/marketplace'

// Restricted-category checkout banner (labeling ≠ licensing).
//
// Renders when a product trips one or more restricted categories iLaunchify
// doesn't support yet (alcohol / hemp-CBD / tobacco-nicotine / OTC drug /
// kratom). The order is HARD-blocked server-side; this banner explains why and
// carries the not-legal-advice disclaimer. Presentational only — the hits are
// computed server-side by checkProductRestrictions.

export function RestrictedProductNotice({ restrictions }: { restrictions: RestrictionHit[] }) {
  if (restrictions.length === 0) return null

  return (
    <div
      role="alert"
      className="rounded-xl border border-warning-300 bg-warning-50 p-4 text-warning-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">
            This product can&rsquo;t be ordered yet
          </p>
          <p className="text-[12px] leading-relaxed text-warning-800">
            It falls into a category that requires licensing or permitting
            iLaunchify doesn&rsquo;t support yet. Ordering is disabled.
          </p>
          <ul className="space-y-1.5">
            {restrictions.map((r) => (
              <li key={r.code} className="text-[12px] leading-relaxed">
                <span className="font-semibold">{r.label}.</span>{' '}
                <span className="text-warning-800">{r.detail}</span>
                {r.citation ? (
                  <span className="block text-[10.5px] text-warning-700/80">{r.citation}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] italic text-warning-700/80">
            This is not legal advice. iLaunchify&rsquo;s compliance tooling is
            assistive and does not replace your own regulatory review.
          </p>
        </div>
      </div>
    </div>
  )
}
