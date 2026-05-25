'use client'

// Usage tab — V1 stub. Full implementation lands in #166+.
// Per docs/BRAND_IDENTITY_STUDIO.md §9.
//
// Roadmap:
//   - Do / Don't gallery (per-rule images + caption)
//   - Auto-generated brand-book PDF (label-press-ready)
//   - Shareable read-only brand-book URL for partners/agencies

import { BookOpen, Sparkles, Check, X } from 'lucide-react'

export function UsageTab({
  brandId: _brandId,
  brandName,
}: {
  brandId: string
  brandName: string
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <BookOpen className="h-4 w-4 text-zinc-500" />
          Usage Rules &amp; Brand Book
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          DO &amp; DON&apos;T guidelines + a shareable brand book PDF for partners and agencies.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
        <h4 className="mt-3 text-sm font-semibold text-zinc-900">Coming next</h4>
        <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500">
          Build per-rule DO/DON&apos;T examples with reference images. Export a press-ready brand
          book PDF assembled from every tab above. Generate a public read-only link to share
          {' '}<strong>{brandName}</strong>&apos;s identity with your manufacturing partner or
          freelance designer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <Check className="h-3.5 w-3.5" /> DO — sample rules
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-zinc-700">
            <li>• Use the primary mark at minimum 24px height on digital surfaces.</li>
            <li>• Maintain clear-space equal to the height of the icon on all sides.</li>
            <li>• Pair body copy with the chosen body font + base 16px size.</li>
          </ul>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50/40 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-red-700">
            <X className="h-3.5 w-3.5" /> DON&apos;T — sample rules
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-zinc-700">
            <li>• Don&apos;t stretch, skew, or recolor the primary mark.</li>
            <li>• Don&apos;t place the logo on low-contrast backgrounds (WCAG &lt; 3).</li>
            <li>• Don&apos;t use any banned tone words in customer-facing copy.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
