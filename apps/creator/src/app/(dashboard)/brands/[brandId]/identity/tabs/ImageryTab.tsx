'use client'

// Imagery tab — V1 stub. Full implementation lands in #166.
// Per docs/BRAND_IDENTITY_STUDIO.md §8.
//
// Roadmap:
//   - Photography style (lifestyle, studio, flat-lay, in-context)
//   - Illustration style enum (none, line, geometric, organic, painterly, 3D)
//   - Pattern library upload
//   - AI image generator presets pre-tuned to the brand archetype + palette

import { Camera, Sparkles } from 'lucide-react'

export function ImageryTab({ brandId: _brandId }: { brandId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Camera className="h-4 w-4 text-zinc-500" />
          Imagery
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Photography &amp; illustration direction — feeds the Design Studio template gallery and
          AI image generator.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
        <h4 className="mt-3 text-sm font-semibold text-zinc-900">Coming next</h4>
        <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500">
          A photography-style picker (lifestyle / studio / flat-lay), illustration style enum,
          and a hosted pattern library. Once set, AI image generation in the Design Studio will
          stay on-brand by default.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STYLE_BUCKETS.map((b) => (
          <div key={b.title} className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {b.title}
            </div>
            <div className="mt-2 text-sm text-zinc-700">{b.options.join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const STYLE_BUCKETS = [
  {
    title: 'Photography style',
    options: ['Lifestyle', 'Studio', 'Flat-lay', 'In-context', 'Macro'],
  },
  {
    title: 'Illustration style',
    options: ['Line', 'Geometric', 'Organic', 'Painterly', '3D', 'None'],
  },
  {
    title: 'Patterns / textures',
    options: ['None', 'Subtle grain', 'Botanical motif', 'Geometric grid'],
  },
]
