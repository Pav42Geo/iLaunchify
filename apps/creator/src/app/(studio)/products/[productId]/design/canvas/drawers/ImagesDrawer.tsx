'use client'

// ImagesDrawer — left-rail Images tool drawer.
// Per docs/DESIGN_STUDIO_REBUILD.md §3.3 tool #4:
//   - "My Brand" pinned section showing brand.logos
//   - "My Library" — creator's previous canvas uploads + Upload button
//
// DS-51: R2-backed uploads. The upload flow:
//   1. Drag-drop OR click → validate type + size client-side
//   2. POST FormData to uploadCanvasImage server action
//   3. R2 PutObject + Asset row insert
//   4. Returned publicUrl gets pushed to library state + auto-drops to canvas
//
// Existing assets for this product preload server-side and refresh after
// each successful upload so refreshing the page doesn't lose history.

import * as React from 'react'
import { Upload, ImagePlus, X } from 'lucide-react'
import {
  addImageFromUrl,
  type BrandCanvasAssets,
  type FabricCanvas,
} from '@ilaunchify/ui'
import {
  uploadCanvasImage,
  listCanvasUploads,
  type UploadedAsset,
} from '../actions'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
  productId: string
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif'
const MAX_BYTES = 10 * 1024 * 1024

export function ImagesDrawer({ canvas, brandAssets, productId }: Props) {
  const [busyLogoId, setBusyLogoId] = React.useState<string | null>(null)
  const [library, setLibrary] = React.useState<UploadedAsset[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isDraggingOver, setDraggingOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load existing uploads on mount.
  React.useEffect(() => {
    let cancelled = false
    listCanvasUploads(productId).then((rows) => {
      if (!cancelled) setLibrary(rows)
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  const usableLogos = brandAssets.logos.filter((l) => l.publicUrl)

  async function handleDropLogo(id: string, url: string) {
    if (!canvas) return
    setBusyLogoId(id)
    try {
      await addImageFromUrl(canvas, url, { maxFraction: 0.4 })
    } finally {
      setBusyLogoId(null)
    }
  }

  async function handleDropLibrary(url: string) {
    if (!canvas) return
    await addImageFromUrl(canvas, url, { maxFraction: 0.4 })
  }

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    const file = Array.from(files)[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError(`File too large — max ${Math.floor(MAX_BYTES / (1024 * 1024))} MB.`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadCanvasImage(productId, fd)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Prepend to library + drop onto canvas immediately.
      setLibrary((prev) => [result.asset, ...prev])
      if (canvas) {
        await addImageFromUrl(canvas, result.asset.publicUrl, { maxFraction: 0.4 })
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* My Brand */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
          My Brand
          <span className="ml-1.5 text-pink-700 normal-case font-normal tracking-normal">
            · {brandAssets.brandName}
          </span>
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
                disabled={!canvas || busyLogoId === logo.id}
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
                {busyLogoId === logo.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-semibold text-ink-700">
                    Adding…
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* My Library */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            My Library
          </div>
          <span className="text-[10px] text-ink-500 tabular-nums">
            {library.length} upload{library.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Upload zone */}
        <div
          onDragEnter={(e) => {
            e.preventDefault()
            setDraggingOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDraggingOver(true)
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDraggingOver(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={
            'rounded-md border-2 border-dashed transition-colors p-5 text-center cursor-pointer ' +
            (isDraggingOver
              ? 'border-pink-500 bg-pink-50'
              : 'border-ink-300 bg-ink-50 hover:border-ink-400 hover:bg-ink-100')
          }
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          <Upload className="mx-auto h-5 w-5 text-ink-500" />
          <p className="mt-1.5 text-xs text-ink-900 font-semibold">
            {uploading ? 'Uploading…' : 'Drop image or click to upload'}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            PNG · JPEG · WebP · SVG · GIF · up to{' '}
            {Math.floor(MAX_BYTES / (1024 * 1024))} MB
          </p>
        </div>

        {error && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md bg-pink-50 border border-pink-200 px-3 py-2 text-[11.5px] text-pink-900">
            <X strokeWidth={2.5} className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Library grid */}
        {library.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {library.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => handleDropLibrary(asset.publicUrl)}
                disabled={!canvas}
                className="group relative aspect-square rounded-md border border-ink-200 bg-white hover:border-pink-300 hover:shadow-sm transition-all overflow-hidden disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.publicUrl}
                  alt="Library asset"
                  className="absolute inset-0 w-full h-full object-contain bg-ink-50"
                />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
