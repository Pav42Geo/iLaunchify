'use client'

// Logos section — three variant slots (PRIMARY / ICON / HORIZONTAL).
// Per docs/DESIGN_STUDIO_REBUILD.md §4. Other variants (VERTICAL / MONOGRAM /
// INVERSE / FAVICON) were dropped 2026-05-26 — creators got confused by the
// distinctions and label designers rarely need more than 3 in V1.

import { useRef, useState, useTransition } from 'react'
import { Button, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Upload, Trash2 } from 'lucide-react'
import { uploadLogoVariant, removeLogoVariant, type LogoVariant } from './actions'

interface AssetSummary {
  id: string
  publicUrl: string | null
  storageKey: string
  mimeType: string
}

interface Props {
  brandId: string
  primary: AssetSummary | null
  icon: AssetSummary | null
  horizontal: AssetSummary | null
}

const VARIANTS: Array<{ key: LogoVariant; label: string; description: string }> = [
  { key: 'PRIMARY', label: 'Primary', description: 'Your master mark. Used as the default in the Design Studio Images drawer.' },
  { key: 'ICON', label: 'Icon', description: 'Square / circular variant for tight spaces — small label corners, social avatars.' },
  { key: 'HORIZONTAL', label: 'Horizontal lockup', description: 'Wide format for hero bands, header strips.' },
]

export function LogosSection({ brandId, primary, icon, horizontal }: Props) {
  const assets: Record<LogoVariant, AssetSummary | null> = {
    PRIMARY: primary,
    ICON: icon,
    HORIZONTAL: horizontal,
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Logos</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Upload up to three logo variants. They appear under <strong>My Brand</strong> in the
          Design Studio Images drawer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {VARIANTS.map((v) => (
          <LogoSlot key={v.key} brandId={brandId} variant={v} asset={assets[v.key]} />
        ))}
      </div>
    </section>
  )
}

function LogoSlot({
  brandId,
  variant,
  asset,
}: {
  brandId: string
  variant: { key: LogoVariant; label: string; description: string }
  asset: AssetSummary | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function onPick(file: File) {
    const formData = new FormData()
    formData.set('brandId', brandId)
    formData.set('variant', variant.key)
    formData.set('file', file)
    startTransition(async () => {
      const result = await uploadLogoVariant(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${variant.label} logo updated`)
    })
  }

  function onRemove() {
    if (!confirm(`Remove ${variant.label.toLowerCase()} logo?`)) return
    startTransition(async () => {
      const result = await removeLogoVariant({ brandId, variant: variant.key })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${variant.label} logo removed`)
    })
  }

  return (
    <div className="flex flex-col rounded-md border border-zinc-200">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
          if (e.target) e.target.value = ''
        }}
        disabled={isPending}
      />
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-t-md bg-zinc-50 p-4">
        {asset?.publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.publicUrl}
            alt={`${variant.label} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="text-center text-xs text-zinc-400">
            <Upload className="mx-auto mb-1 h-5 w-5" />
            No {variant.label.toLowerCase()} yet
          </div>
        )}
      </div>
      <div className="flex-1 space-y-1.5 p-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {variant.label}
        </Label>
        <p className="text-xs text-zinc-500">{variant.description}</p>
      </div>
      <div className="flex gap-1.5 border-t border-zinc-200 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          {asset ? 'Replace' : 'Upload'}
        </Button>
        {asset && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemove}
            disabled={isPending}
            aria-label={`Remove ${variant.label}`}
            className="text-zinc-500 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
