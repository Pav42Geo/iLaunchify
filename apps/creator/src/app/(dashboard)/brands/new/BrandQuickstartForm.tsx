'use client'

import { useRef, useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload, FileImage, Sparkles, Check } from 'lucide-react'
import { createBrand } from './actions'

export interface StylePresetOption {
  id: string
  slug: string
  name: string
  description: string
  styleTags: string[]
  sampleTagline: string | null
  paletteId: string | null
  paletteName: string | null
  paletteSwatch: { primary: string; secondary: string; accent: string } | null
  typographyPairId: string | null
  typographyPairName: string | null
  headingFont: string | null
  bodyFont: string | null
}

interface Props {
  defaultName: string
  defaultHandle: string
  stylePresets: StylePresetOption[]
}

const SUGGESTED_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#dc2626', '#9333ea', '#0f172a']

export function BrandQuickstartForm({ defaultName, defaultHandle, stylePresets }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(defaultName)
  const [handle, setHandle] = useState(defaultHandle)
  const [tagline, setTagline] = useState('')
  const [colorPrimary, setColorPrimary] = useState('#16a34a')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const selectedPreset = stylePresets.find((p) => p.id === selectedPresetId) ?? null

  function pickPreset(preset: StylePresetOption) {
    if (selectedPresetId === preset.id) {
      // Toggle off — go back to custom
      setSelectedPresetId(null)
      return
    }
    setSelectedPresetId(preset.id)
    // Auto-fill primary color from the recommended palette
    if (preset.paletteSwatch) {
      setColorPrimary(preset.paletteSwatch.primary)
    }
    // Pre-fill tagline if creator hasn't typed one
    if (!tagline.trim() && preset.sampleTagline) {
      setTagline(preset.sampleTagline)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('name', name)
    formData.set('handle', handle)
    formData.set('tagline', tagline)
    formData.set('colorPrimary', colorPrimary)
    if (selectedPreset) {
      formData.set('brandStylePresetId', selectedPreset.id)
      if (selectedPreset.paletteId) formData.set('colorPaletteId', selectedPreset.paletteId)
      if (selectedPreset.typographyPairId) {
        formData.set('typographyPairId', selectedPreset.typographyPairId)
      }
    }
    if (logo) formData.set('logo', logo)

    startTransition(async () => {
      const result = await createBrand(formData)
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`${name} created!`)
      router.push('/dashboard')
      router.refresh()
    })
  }

  // Auto-suggest handle from name as user types (only until they touch handle field)
  const [handleTouched, setHandleTouched] = useState(false)
  function onNameChange(v: string) {
    setName(v)
    if (!handleTouched) {
      setHandle(slugify(v))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      {/* Style preset picker — curated catalog of palette + typography combos */}
      {stylePresets.length > 0 && (
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Pick a starting style
              <span className="text-xs font-normal text-zinc-500">(optional)</span>
            </Label>
            <p className="mt-1 text-xs text-zinc-500">
              Each preset locks in a curated palette + typography pair. You can fine-tune
              later in Brand Studio.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stylePresets.map((p) => {
              const isSelected = selectedPresetId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p)}
                  className={`flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                  }`}
                  disabled={isPending}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-semibold text-zinc-900">{p.name}</span>
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
                  </div>
                  {p.paletteSwatch && (
                    <div className="flex h-5 w-full overflow-hidden rounded">
                      <span
                        className="h-full flex-1"
                        style={{ backgroundColor: p.paletteSwatch.primary }}
                        aria-label={`primary ${p.paletteSwatch.primary}`}
                      />
                      <span
                        className="h-full flex-1"
                        style={{ backgroundColor: p.paletteSwatch.secondary }}
                        aria-label={`secondary ${p.paletteSwatch.secondary}`}
                      />
                      <span
                        className="h-full flex-1"
                        style={{ backgroundColor: p.paletteSwatch.accent }}
                        aria-label={`accent ${p.paletteSwatch.accent}`}
                      />
                    </div>
                  )}
                  <div className="text-xs text-zinc-500">{p.description}</div>
                  {p.headingFont && p.bodyFont && (
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                      {p.headingFont} + {p.bodyFont}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {selectedPreset && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              ✓ Locked in <strong>{selectedPreset.name}</strong> — palette + typography ride
              along automatically. Tweak the brand color below if you want a custom primary.
            </div>
          )}
        </div>
      )}

      {/* Brand name + handle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-zinc-900">
            Brand name <RequiredBadge />
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Lumin Botanicals"
            required
            disabled={isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="handle" className="text-sm font-medium text-zinc-900">
            Handle <RequiredBadge />
          </Label>
          <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-300">
            <span className="flex items-center bg-zinc-50 px-3 text-xs text-zinc-500">
              ilaunchify.com/
            </span>
            <input
              id="handle"
              value={handle}
              onChange={(e) => {
                setHandleTouched(true)
                setHandle(e.target.value.toLowerCase())
              }}
              required
              pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?"
              className="block w-full bg-white px-3 py-2 text-sm focus:outline-none"
              disabled={isPending}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Lowercase letters, numbers, and dashes. Used in URLs.
          </p>
        </div>
      </div>

      {/* Tagline */}
      <div className="space-y-1.5">
        <Label htmlFor="tagline" className="text-sm font-medium text-zinc-900">
          Tagline (optional)
        </Label>
        <Input
          id="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="e.g. Clean botanical wellness, made plainly"
          maxLength={120}
          disabled={isPending}
        />
      </div>

      {/* Primary color */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Primary color</Label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={colorPrimary}
            onChange={(e) => setColorPrimary(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-zinc-300 bg-white"
            disabled={isPending}
            aria-label="Pick primary color"
          />
          <Input
            value={colorPrimary}
            onChange={(e) => setColorPrimary(e.target.value)}
            className="w-32 font-mono text-sm uppercase"
            maxLength={7}
            disabled={isPending}
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorPrimary(c)}
                className="h-7 w-7 rounded-md border-2 border-zinc-200 transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                aria-label={`Use ${c}`}
                disabled={isPending}
              />
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Used on labels + storefront. You can refine the full palette in Brand Studio later.
        </p>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Logo (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
          disabled={isPending}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-left hover:border-zinc-400"
          disabled={isPending}
        >
          {logo ? (
            <>
              <FileImage className="h-5 w-5 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">{logo.name}</div>
                <div className="text-xs text-zinc-500">{(logo.size / 1024).toFixed(1)} KB</div>
              </div>
              <span className="text-xs text-emerald-700">Click to change</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-zinc-400" />
              <div className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">Upload logo</span>
                <span className="ml-1 text-xs">PNG, JPEG, WebP, SVG · up to 5 MB</span>
              </div>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
          {isPending ? 'Creating brand…' : 'Create brand'}
        </Button>
      </div>
    </form>
  )
}

function RequiredBadge() {
  return (
    <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">
      Required
    </span>
  )
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
