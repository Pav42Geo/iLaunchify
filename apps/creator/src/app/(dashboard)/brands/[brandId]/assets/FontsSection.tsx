'use client'

// Fonts section — pick 1-3 from the curated TypographyFont catalog.
// Per docs/DESIGN_STUDIO_REBUILD.md §4.

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Search, Check } from 'lucide-react'
import { setBrandFonts } from './actions'

interface FontOption {
  id: string
  family: string
  weight: string
  style: string
  webfontUrl: string | null
}

interface Props {
  brandId: string
  selectedFontIds: string[]
  catalog: FontOption[]
}

const MAX_FONTS = 3

export function FontsSection({ brandId, selectedFontIds, catalog }: Props) {
  const [selected, setSelected] = useState<string[]>(selectedFontIds)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Fonts</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Pick 1–3 from the curated catalog. Typically a heading font + a body font + an
            optional accent. These pin to the top of the font dropdown in the Design Studio
            canvas text tools.
          </p>
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
              const font = catalog.find((f) => f.id === id)
              if (!font) return null
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 rounded bg-white px-3 py-2 text-sm"
                >
                  <span
                    style={{
                      fontFamily: font.webfontUrl ? `'${font.family}', system-ui` : 'system-ui',
                    }}
                    className="font-medium text-zinc-900"
                  >
                    {font.family}{' '}
                    <span className="text-xs font-normal text-zinc-500">{font.weight}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    disabled={isPending}
                    className="text-xs text-zinc-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-zinc-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts…"
          className="max-w-sm"
        />
        <span className="text-xs text-zinc-400">
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
                    : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
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
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
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
        <div className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
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
  const cls = pending ? 'text-zinc-500' : status === 'saved' ? 'text-emerald-600' : status === 'error' ? 'text-red-600' : ''
  return <span className={`text-xs ${cls}`}>{text}</span>
}
