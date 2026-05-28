'use client'

// ImagesDrawer — left-rail Images tool drawer.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #4:
//   - "My Brand" pinned section at the top showing brand.logos
//     (PRIMARY / ICON / HORIZONTAL variants) as clickable thumbnails
//   - "My Library" — V1 stub for the creator's uploaded assets
//   - Upload button — V1 placeholder; real R2/S3 wiring lands when the
//     asset upload action is built next
//
// Brand asset integration is the headline of Phase E.

import * as React from 'react'
import { Upload, ImagePlus } from 'lucide-react'
import {
  addImageFromUrl,
  type BrandCanvasAssets,
  type FabricCanvas,
} from '@ilaunchify/ui'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
}

export function ImagesDrawer({ canvas, brandAssets }: Props) {
  const [busy, setBusy] = React.useState<string | null>(null)

  const usableLogos = brandAssets.logos.filter((l) => l.publicUrl)
  const brandName = brandAssets.brandName

  async function handleDropLogo(id: string, url: string) {
    if (!canvas) return
    setBusy(id)
    try {
      await addImageFromUrl(canvas, url, { maxFraction: 0.4 })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* My Brand */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            My Brand
            <span className="ml-1.5 text-pink-700 normal-case font-normal tracking-normal">
              · {brandName}
            </span>
          </div>
        </div>

        {usableLogos.length === 0 ? (
          <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-4 text-center">
            <ImagePlus className="mx-auto h-5 w-5 text-ink-400" />
            <p className="mt-1.5 text-xs text-ink-700 font-medium">
              No logo variants yet
            </p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              Upload a primary logo in{' '}
              <a
                href={`/brands/${brandAssets.brandId}/assets`}
                className="text-pink-700 font-semibold hover:text-pink-600"
              >
                Brand assets
              </a>{' '}
              and it&apos;ll show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {usableLogos.map((logo) => (
              <button
                key={logo.id}
                type="button"
                onClick={() => logo.publicUrl && handleDropLogo(logo.id, logo.publicUrl)}
                disabled={!canvas || busy === logo.id}
                className="group relative aspect-square rounded-md border border-ink-200 bg-white hover:border-pink-300 hover:shadow-sm transition-all overflow-hidden disabled:opacity-50"
              >
                {logo.publicUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logo.publicUrl}
                    alt={`${logo.variant} logo`}
                    className="absolute inset-1 w-[calc(100%-0.5rem)] h-[calc(100%-0.5rem)] object-contain"
                  />
                ) : null}
                <span className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm text-[9px] font-bold uppercase tracking-wider text-ink-700 text-center py-0.5">
                  {logo.variant.toLowerCase()}
                </span>
                {busy === logo.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-semibold text-ink-700">
                    Adding…
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-500">
          Click a logo to drop it on the canvas. Resize from the corner
          handles after it lands.
        </p>
      </section>

      {/* My Library — V1 stub */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            My Library
          </div>
          <span className="text-[10px] text-ink-400 normal-case font-normal">
            soon
          </span>
        </div>
        <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-6 text-center">
          <Upload className="mx-auto h-5 w-5 text-ink-400" />
          <p className="mt-1.5 text-xs text-ink-700 font-medium">
            Upload coming next
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500 max-w-[26ch] mx-auto">
            R2-backed image uploads land in the next pass. Until then drop in
            from your Brand assets.
          </p>
        </div>
      </section>
    </div>
  )
}
