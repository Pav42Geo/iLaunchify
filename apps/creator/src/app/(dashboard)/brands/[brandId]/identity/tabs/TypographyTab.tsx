'use client'

// Typography tab — pair switcher + accent font + type-scale ratio.
// Per docs/BRAND_IDENTITY_STUDIO.md §5 + #165.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Type, Check } from 'lucide-react'
import { saveBrandTypography } from '../actions'

interface PairOption {
  id: string
  name: string
  description: string | null
  styleTags: string[]
  heading: string
  body: string
}

interface AccentFontOption {
  id: string
  label: string
}

interface TypographyTabProps {
  brandId: string
  pairs: PairOption[]
  accentFonts: AccentFontOption[]
  selectedPairId: string | null
  selectedAccentId: string | null
  currentRatio: number
  currentPairSummary: { name: string; heading: string; body: string } | null
}

const SCALE_RATIOS = [
  { value: 1.125, label: 'Major Second (1.125)' },
  { value: 1.2, label: 'Minor Third (1.2)' },
  { value: 1.25, label: 'Major Third (1.25)' },
  { value: 1.333, label: 'Perfect Fourth (1.333)' },
  { value: 1.414, label: 'Augmented Fourth (1.414)' },
  { value: 1.5, label: 'Perfect Fifth (1.5)' },
  { value: 1.618, label: 'Golden Ratio (1.618)' },
]

export function TypographyTab({
  brandId,
  pairs,
  accentFonts,
  selectedPairId,
  selectedAccentId,
  currentRatio,
  currentPairSummary,
}: TypographyTabProps) {
  const router = useRouter()
  const [pairId, setPairId] = useState<string | null>(selectedPairId)
  const [accentId, setAccentId] = useState<string | null>(selectedAccentId)
  const [ratio, setRatio] = useState<number>(currentRatio)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit(patch: { pairId?: string | null; accentId?: string | null; ratio?: number }) {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveBrandTypography({
        brandId,
        typographyPairId: patch.pairId !== undefined ? patch.pairId : undefined,
        typographyAccentId: patch.accentId !== undefined ? patch.accentId : undefined,
        typeScaleRatio: patch.ratio !== undefined ? patch.ratio : undefined,
      })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Current selection preview */}
      {currentPairSummary && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Current selection
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-900">
            {currentPairSummary.heading}
          </div>
          <div className="mt-1 text-sm text-zinc-600">
            Body text: {currentPairSummary.body}
          </div>
        </div>
      )}

      {/* Pair picker */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Type className="h-4 w-4 text-zinc-500" />
            Typography pair ({pairs.length} curated)
          </h3>
          <SaveIndicator status={saveStatus} pending={isPending} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map((p) => {
            const isSelected = p.id === pairId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPairId(p.id)
                  commit({ pairId: p.id })
                }}
                disabled={isPending}
                className={`rounded-md border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-zinc-900">{p.name}</span>
                  {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />}
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{p.description}</p>
                )}
                <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-400">
                  {p.heading} + {p.body}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Accent font */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold text-zinc-900">Accent font (optional)</Label>
        <p className="text-xs text-zinc-500">
          A third font for taglines or pull-quotes. Use sparingly — many brands skip this.
        </p>
        <select
          value={accentId ?? ''}
          onChange={(e) => {
            const next = e.target.value || null
            setAccentId(next)
            commit({ accentId: next })
          }}
          disabled={isPending}
          className="block w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">— None —</option>
          {accentFonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </section>

      {/* Scale ratio */}
      <section className="space-y-2">
        <Label className="text-sm font-semibold text-zinc-900">Type scale ratio</Label>
        <p className="text-xs text-zinc-500">
          The proportional jump between font sizes. Higher ratios = more dramatic hierarchy.
        </p>
        <select
          value={String(ratio)}
          onChange={(e) => {
            const next = parseFloat(e.target.value)
            setRatio(next)
            commit({ ratio: next })
          }}
          disabled={isPending}
          className="block w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {SCALE_RATIOS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="mt-3 rounded-md border border-zinc-200 bg-white p-4">
          <div style={{ fontSize: `${16 * Math.pow(ratio, 3)}px`, fontWeight: 700 }}>
            Display
          </div>
          <div style={{ fontSize: `${16 * Math.pow(ratio, 2)}px`, fontWeight: 600, marginTop: 6 }}>
            Heading
          </div>
          <div style={{ fontSize: `${16 * ratio}px`, fontWeight: 500, marginTop: 6 }}>
            Subheading
          </div>
          <div style={{ fontSize: 16, marginTop: 6 }}>
            Body — preview at 16px base
          </div>
          <div style={{ fontSize: `${16 / ratio}px`, marginTop: 6, color: '#71717a' }}>
            Caption text
          </div>
        </div>
      </section>
    </div>
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
