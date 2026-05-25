'use client'

// Logo Suite tab — V1 stub. Full implementation lands in #166.
// Per docs/BRAND_IDENTITY_STUDIO.md §3.
//
// Roadmap:
//   - Primary mark uploader (PNG, SVG, source PSD/AI)
//   - Auto-generated variants (icon, horizontal lockup, vertical lockup, monogram, inverse)
//   - Clear-space rules + minimum size
//   - Per-surface placement test (label, social, hero)

import { ImagePlus, Sparkles } from 'lucide-react'

export function LogoSuiteTab({ brandId: _brandId, brandName }: { brandId: string; brandName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <ImagePlus className="h-4 w-4 text-zinc-500" />
          Logo Suite
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          A full set of logo variants ready for any surface — label, social, packaging, hero.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
        <h4 className="mt-3 text-sm font-semibold text-zinc-900">Coming next for {brandName}</h4>
        <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500">
          Today you can upload a single primary mark in <strong>Quickstart</strong>. Soon this tab
          will let you generate &amp; manage the full suite — icon, horizontal lockup, vertical
          stack, monogram, and inverse versions — with clear-space and minimum-size rules baked
          in for the label renderer.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {LOGO_VARIANTS.map((v) => (
          <div
            key={v.key}
            className="flex aspect-square flex-col items-center justify-center rounded-md border border-zinc-200 bg-white p-3 text-center"
          >
            <div className="text-xs font-semibold text-zinc-700">{v.label}</div>
            <div className="mt-1 text-[10px] text-zinc-400">{v.hint}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const LOGO_VARIANTS = [
  { key: 'primary', label: 'Primary', hint: 'Master mark' },
  { key: 'icon', label: 'Icon', hint: 'Favicon, app, social' },
  { key: 'horizontal', label: 'Horizontal', hint: 'Header lockup' },
  { key: 'vertical', label: 'Vertical', hint: 'Stacked for narrow' },
  { key: 'monogram', label: 'Monogram', hint: 'Letterforms only' },
] as const
