'use client'

// Tagline section — single string, save-on-blur. The over-built "secondary
// taglines" array was dropped 2026-05-26.

import { useState, useTransition } from 'react'
import { Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { setBrandTagline } from './actions'

interface Props {
  brandId: string
  initial: string | null
}

export function TaglineSection({ brandId, initial }: Props) {
  const [tagline, setTagline] = useState(initial ?? '')
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit() {
    if (tagline === (initial ?? '')) return // no-op if unchanged
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await setBrandTagline({ brandId, tagline })
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
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Tagline</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Short brand line. Can be dropped onto the label as a pre-filled text element from
            the Design Studio canvas.
          </p>
        </div>
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      <Label htmlFor="tagline" className="sr-only">
        Tagline
      </Label>
      <Input
        id="tagline"
        value={tagline}
        onChange={(e) => setTagline(e.target.value)}
        onBlur={commit}
        placeholder='e.g. "Clean botanical wellness, made plainly."'
        maxLength={120}
        disabled={isPending}
        className="text-lg"
      />
      <p className="mt-1 text-[11px] text-zinc-400">{tagline.length} / 120</p>
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
