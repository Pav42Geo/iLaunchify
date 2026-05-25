'use client'

// Taglines tab — primary + secondary array editor.
// Per docs/BRAND_IDENTITY_STUDIO.md §7 + #165.

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Quote, Plus, X } from 'lucide-react'
import { saveBrandTaglines } from '../actions'

interface TaglinesTabProps {
  brandId: string
  initial: {
    tagline: string | null
    secondaryTaglines: string[]
  }
}

export function TaglinesTab({ brandId, initial }: TaglinesTabProps) {
  const [primary, setPrimary] = useState(initial.tagline ?? '')
  const [secondary, setSecondary] = useState<string[]>(initial.secondaryTaglines)
  const [draft, setDraft] = useState('')
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit(patch: Parameters<typeof saveBrandTaglines>[0]) {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveBrandTaglines(patch)
      if (!result.ok) {
        setSaveStatus('error')
        toast.error(result.error)
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    })
  }

  function addSecondary() {
    const v = draft.trim()
    if (!v) return
    if (secondary.includes(v)) {
      setDraft('')
      return
    }
    const next = [...secondary, v]
    setSecondary(next)
    setDraft('')
    commit({ brandId, secondaryTaglines: next })
  }

  function removeSecondary(i: number) {
    const next = secondary.filter((_, idx) => idx !== i)
    setSecondary(next)
    commit({ brandId, secondaryTaglines: next })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Quote className="h-4 w-4 text-zinc-500" />
          Taglines
        </h3>
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      {/* Primary */}
      <section className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Primary tagline</Label>
        <p className="text-xs text-zinc-500">
          One headline message. Prints on packaging + lives in your storefront hero.
        </p>
        <Input
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          onBlur={() => commit({ brandId, tagline: primary })}
          placeholder='e.g. "Clean botanical wellness, made plainly."'
          maxLength={120}
          disabled={isPending}
          className="max-w-2xl text-lg"
        />
        <p className="text-[11px] text-zinc-400">{primary.length} / 120</p>
      </section>

      {/* Secondary list */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-medium text-zinc-900">Secondary taglines</Label>
          <p className="text-xs text-zinc-500">
            Variants for different contexts — product detail pages, social, email subject
            lines. Pick the best fit at print time.
          </p>
        </div>

        {secondary.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
            No secondary taglines yet. Most brands end up with 3-5.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {secondary.map((t, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <span className="text-zinc-700">{t}</span>
                <button
                  type="button"
                  onClick={() => removeSecondary(i)}
                  disabled={isPending}
                  aria-label="Remove tagline"
                  className="text-zinc-400 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSecondary()
              }
            }}
            placeholder="Add another tagline…"
            disabled={isPending}
            maxLength={120}
            className="max-w-2xl"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSecondary}
            disabled={isPending || !draft.trim()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
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
