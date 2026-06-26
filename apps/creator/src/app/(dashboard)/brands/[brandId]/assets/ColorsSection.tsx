'use client'

// Colors section — 3 named swatches (primary / secondary / accent) + up to 2
// optional extra swatches. Save on blur.
// Per docs/DESIGN_STUDIO_REBUILD.md §4.

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { setBrandColors } from './actions'
import { InfoTip } from '@/app/(studio)/products/[productId]/design/canvas/InfoTip'

interface Props {
  brandId: string
  initial: {
    colorPrimary: string | null
    colorSecondary: string | null
    colorAccent: string | null
    brandSwatches: string[]
  }
}

const MAX_EXTRA = 2

export function ColorsSection({ brandId, initial }: Props) {
  const [primary, setPrimary] = useState(initial.colorPrimary ?? '#16a34a')
  const [secondary, setSecondary] = useState(initial.colorSecondary ?? '#475569')
  const [accent, setAccent] = useState(initial.colorAccent ?? '#f59e0b')
  const [extras, setExtras] = useState<string[]>(initial.brandSwatches)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit() {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await setBrandColors({
        brandId,
        colorPrimary: primary,
        colorSecondary: secondary,
        colorAccent: accent,
        brandSwatches: extras,
      })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  function addExtra() {
    if (extras.length >= MAX_EXTRA) return
    setExtras([...extras, '#ffffff'])
  }

  function updateExtra(i: number, value: string) {
    const next = [...extras]
    next[i] = value
    setExtras(next)
  }

  function removeExtra(i: number) {
    const next = extras.filter((_, idx) => idx !== i)
    setExtras(next)
    // Commit immediately on removal so the swatch disappears from the canvas.
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await setBrandColors({
        brandId,
        colorPrimary: primary,
        colorSecondary: secondary,
        colorAccent: accent,
        brandSwatches: next,
      })
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  return (
    <section className="rounded-lg border border-ink-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-ink-900">Colors</h2>
          <InfoTip text="Three named swatches + up to two extras. These pin to the top of every color picker in the Design Studio canvas." />
        </div>
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NamedSwatch label="Primary" value={primary} onChange={setPrimary} onCommit={commit} disabled={isPending} />
        <NamedSwatch label="Secondary" value={secondary} onChange={setSecondary} onCommit={commit} disabled={isPending} />
        <NamedSwatch label="Accent" value={accent} onChange={setAccent} onCommit={commit} disabled={isPending} />
      </div>

      {(extras.length > 0 || extras.length < MAX_EXTRA) && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="flex items-center gap-1">
            <Label className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Extra swatches
            </Label>
            <InfoTip text="Optional. Use for secondary brand colors that aren't primary / accent." />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {extras.map((c, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => updateExtra(i, e.target.value)}
                  onBlur={commit}
                  disabled={isPending}
                  className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-white"
                  aria-label={`Extra swatch ${i + 1}`}
                />
                <Input
                  value={c.toUpperCase()}
                  onChange={(e) => updateExtra(i, e.target.value.toLowerCase())}
                  onBlur={commit}
                  className="w-24 font-mono text-xs"
                  maxLength={7}
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => removeExtra(i)}
                  disabled={isPending}
                  aria-label="Remove swatch"
                  className="rounded p-1 text-ink-400 hover:text-danger-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {extras.length < MAX_EXTRA && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addExtra}
                disabled={isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add swatch
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function NamedSwatch({
  label,
  value,
  onChange,
  onCommit,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  disabled: boolean
}) {
  return (
    <div className="rounded-md border border-ink-200 bg-white p-3">
      <Label className="text-xs font-bold uppercase tracking-wider text-ink-700">
        {label}
      </Label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          disabled={disabled}
          aria-label={`${label} color picker`}
          className="h-9 w-12 cursor-pointer rounded border border-ink-300 bg-white"
        />
        <Input
          value={value.toUpperCase()}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          onBlur={onCommit}
          disabled={disabled}
          className="w-28 font-mono text-xs"
          maxLength={7}
        />
      </div>
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
  const cls = pending ? 'text-ink-500' : status === 'saved' ? 'text-success-600' : status === 'error' ? 'text-danger-600' : ''
  return <span className={`text-xs ${cls}`}>{text}</span>
}
