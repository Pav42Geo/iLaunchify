'use client'

// Fonts section — pick 1-3 from the curated TypographyFont catalog.
// Per docs/DESIGN_STUDIO_REBUILD.md §4.

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label, loadCustomFont, Checkbox } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Search, Check, Upload, Trash2 } from 'lucide-react'
import { setBrandFonts, uploadBrandFont, removeBrandFont } from './actions'
import { InfoTip } from '@/app/(studio)/products/[productId]/design/canvas/InfoTip'

interface FontOption {
  id: string
  family: string
  weight: string
  style: string
  webfontUrl: string | null
}

/** A creator-uploaded custom brand font (Brand Kit V2 Slice 2). */
interface CustomFont {
  ref: string // `custom:<id>` — the value stored in brandFontIds
  id: string
  family: string
  webUrl: string | null
}

interface Props {
  brandId: string
  selectedFontIds: string[]
  catalog: FontOption[]
  /** Creator-uploaded custom fonts for this brand. */
  customFonts?: CustomFont[]
  /** Whether this creator's tier may upload custom fonts (Builder+). */
  canUploadCustomFonts?: boolean
}

const MAX_FONTS = 3

export function FontsSection({
  brandId,
  selectedFontIds,
  catalog,
  customFonts = [],
  canUploadCustomFonts = false,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(selectedFontIds)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Upload form state.
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadLicense, setUploadLicense] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Register uploaded fonts with the browser so previews render in-typeface.
  useEffect(() => {
    for (const f of customFonts) {
      if (f.webUrl) void loadCustomFont(f.family, f.webUrl)
    }
  }, [customFonts])

  /** Resolve a selected id (catalog family or `custom:<id>`) to a display label + face. */
  function displayFor(id: string): { family: string; loaded: boolean } | null {
    const cat = catalog.find((f) => f.id === id)
    if (cat) return { family: cat.family, loaded: !!cat.webfontUrl }
    const custom = customFonts.find((f) => f.ref === id)
    if (custom) return { family: custom.family, loaded: !!custom.webUrl }
    return null
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault()
    if (!uploadFile) {
      toast.error('Choose a font file first.')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('brandId', brandId)
      fd.set('family', uploadName)
      fd.set('licenseAttested', uploadLicense ? 'true' : 'false')
      fd.set('file', uploadFile)
      const res = await uploadBrandFont(fd)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Added “${res.family}” to your brand kit.`)
      setUploadName('')
      setUploadFile(null)
      setUploadLicense(false)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  function onDeleteCustom(fontId: string, ref: string) {
    startTransition(async () => {
      const res = await removeBrandFont({ brandId, fontId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setSelected((prev) => prev.filter((v) => v !== ref))
      toast.success('Font removed.')
      router.refresh()
    })
  }

  function toggle(fontId: string) {
    const isSelected = selected.includes(fontId)
    let next: string[]
    if (isSelected) {
      next = selected.filter((id) => id !== fontId)
    } else {
      if (selected.length >= MAX_FONTS) {
        toast.error(`Max ${MAX_FONTS} fonts. Remove one first.`)
        return
      }
      next = [...selected, fontId]
    }
    setSelected(next)
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await setBrandFonts({ brandId, brandFontIds: next })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  const filtered = query.trim()
    ? catalog.filter((f) => f.family.toLowerCase().includes(query.toLowerCase()))
    : catalog

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-ink-900">Fonts</h2>
          <InfoTip text="Pick 1–3 from the curated catalog — typically a heading font, a body font, and an optional accent. These pin to the top of the font dropdown in the Design Studio canvas text tools." />
        </div>
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {selected.length > 0 && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Selected ({selected.length} / {MAX_FONTS})
          </Label>
          <ul className="mt-2 space-y-1">
            {selected.map((id) => {
              const font = displayFor(id)
              if (!font) return null
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded bg-white px-3 py-2 text-sm"
                >
                  <span
                    style={{ fontFamily: font.loaded ? `'${font.family}', system-ui` : 'system-ui' }}
                    className="font-medium text-ink-900"
                  >
                    {font.family}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={isPending}
                    className="text-xs text-ink-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Brand Kit V2 Slice 2 — your uploaded fonts + upload affordance. */}
      <div className="mb-5 rounded-md border border-ink-200 bg-ink-50/40 p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-ink-900">Your brand fonts</h3>
          <InfoTip text="Upload your own fonts (WOFF2, WOFF, TTF, or OTF) to use them in the Design Studio. Available on Builder and Agency plans. Upload the print file (OTF/TTF) you have the rights to embed." />
        </div>

        {customFonts.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {customFonts.map((f) => {
              const isSelected = selected.includes(f.ref)
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded border border-ink-200 bg-white px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => toggle(f.ref)}
                    disabled={isPending}
                    className="flex min-w-0 items-center gap-2 text-left"
                  >
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
                    <span
                      className="truncate text-base text-ink-900"
                      style={{ fontFamily: f.webUrl ? `'${f.family}', system-ui` : 'system-ui' }}
                    >
                      {f.family}
                    </span>
                    <span className="text-[12px] uppercase tracking-wider text-ink-700">custom</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCustom(f.id, f.ref)}
                    disabled={isPending}
                    aria-label={`Delete ${f.family}`}
                    className="text-ink-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {canUploadCustomFonts ? (
          <form onSubmit={onUpload} className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <Label htmlFor="font-name" className="text-xs">
                  Font name
                </Label>
                <Input
                  id="font-name"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Acme Display"
                  disabled={uploading}
                />
              </div>
              <input
                type="file"
                accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
                className="text-xs text-ink-600 file:mr-2 file:rounded file:border file:border-ink-200 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium"
              />
            </div>
            <Checkbox
              checked={uploadLicense}
              onChange={(e) => setUploadLicense(e.target.checked)}
              disabled={uploading}
              className="items-start text-xs text-ink-600"
              label={<span>I have the right to use and embed this font for print and digital.</span>}
            />
            <Button
              type="submit"
              size="sm"
              disabled={uploading || !uploadFile || !uploadName.trim() || !uploadLicense}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? 'Uploading…' : 'Upload a font'}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-ink-600">
            Custom font upload is available on <strong>Builder</strong> and{' '}
            <strong>Agency</strong> plans.{' '}
            <a href="/settings/plan" className="font-semibold text-pink-700 hover:text-pink-600">
              Upgrade
            </a>{' '}
            to add your own fonts.
          </p>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-ink-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts…"
          className="max-w-sm"
        />
        <span className="text-xs text-ink-400">
          {filtered.length} of {catalog.length}
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((font) => {
          const isSelected = selected.includes(font.id)
          return (
            <li key={font.id}>
              <button
                type="button"
                onClick={() => toggle(font.id)}
                disabled={isPending}
                className={`flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-ink-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className="truncate text-base"
                    style={{
                      fontFamily: font.webfontUrl ? `'${font.family}', system-ui` : 'system-ui',
                    }}
                  >
                    {font.family}
                  </div>
                  <div className="mt-0.5 text-[12px] uppercase tracking-wider text-ink-700">
                    {font.weight} · {font.style}
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
              </button>
            </li>
          )
        })}
      </ul>

      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
          No fonts match &quot;{query}&quot;.
        </div>
      )}

      {catalog.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>No fonts seeded.</strong> Run the seed script
          (<code className="font-mono text-xs">pnpm --filter @ilaunchify/db seed</code>) to
          populate the curated font catalog.
        </div>
      )}
    </section>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const text = pending ? 'Saving…' : status === 'saved' ? '✓ Saved' : status === 'error' ? '⚠ Save failed' : ''
  const cls = pending ? 'text-ink-500' : status === 'saved' ? 'text-emerald-600' : status === 'error' ? 'text-red-600' : ''
  return <span className={`text-xs ${cls}`}>{text}</span>
}
