'use client'

// Group × channel preference matrix + quiet hours (docs/EMAIL_NOTIFICATION_CENTER.md).
// Replaced the legacy per-event checkbox list 2026-07-05.

import { useState, useTransition } from 'react'
import { Button, Input, Label, NotificationPreferenceMatrix } from '@ilaunchify/ui'
import type {
  PreferenceMatrixCategory,
  PreferenceMatrixCell,
  PreferenceChannel,
} from '@ilaunchify/ui'
import { toast } from 'sonner'
import type { NotificationChannel } from '@ilaunchify/db'
import { toggleCategoryPreference, saveQuietHours } from './actions'

function minutesToHHMM(min: number | null): string {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function hhmmToMinutes(s: string): number | null {
  if (!s) return null
  const [h, m] = s.split(':').map((p) => parseInt(p, 10))
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function CategoryPreferencesForm({
  categories,
  cells,
  quietHoursStartUtc,
  quietHoursEndUtc,
}: {
  categories: PreferenceMatrixCategory[]
  cells: PreferenceMatrixCell[]
  quietHoursStartUtc: number | null
  quietHoursEndUtc: number | null
}) {
  const [matrix, setMatrix] = useState(cells)
  const [quietStart, setQuietStart] = useState(minutesToHHMM(quietHoursStartUtc))
  const [quietEnd, setQuietEnd] = useState(minutesToHHMM(quietHoursEndUtc))
  const [isPending, startTransition] = useTransition()

  function handleToggle(category: string, channel: PreferenceChannel, enabled: boolean) {
    // The matrix's channel prop is open-ended ((string & {}) branding defeats
    // narrowing); our platform only has these two, so the cast is safe.
    const ch =
      channel === 'IN_APP' || channel === 'EMAIL' ? (channel as NotificationChannel) : null
    if (!ch) return
    // Optimistic — revert on failure.
    setMatrix((prev) =>
      prev.map((c) => (c.category === category && c.channel === ch ? { ...c, enabled } : c)),
    )
    startTransition(async () => {
      const r = await toggleCategoryPreference({ category, channel: ch, enabled })
      if (!r.ok) {
        setMatrix((prev) =>
          prev.map((c) =>
            c.category === category && c.channel === channel ? { ...c, enabled: !enabled } : c,
          ),
        )
        toast.error(r.error)
      }
    })
  }

  function handleQuietHoursSave() {
    const startUtc = quietStart ? hhmmToMinutes(quietStart) : null
    const endUtc = quietEnd ? hhmmToMinutes(quietEnd) : null
    if ((startUtc == null) !== (endUtc == null)) {
      toast.error('Set both start and end, or leave both empty.')
      return
    }
    startTransition(async () => {
      await saveQuietHours({ startUtc, endUtc })
      toast.success('Quiet hours saved')
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="quiet-start" className="text-ui-label text-ink-700">
            Start (UTC)
          </Label>
          <Input id="quiet-start" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="w-32" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quiet-end" className="text-ui-label text-ink-700">
            End (UTC)
          </Label>
          <Input id="quiet-end" type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="w-32" />
        </div>
        <Button type="button" onClick={handleQuietHoursSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save quiet hours'}
        </Button>
        {(quietStart || quietEnd) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQuietStart('')
              setQuietEnd('')
              startTransition(async () => {
                await saveQuietHours({ startUtc: null, endUtc: null })
                toast.success('Quiet hours cleared')
              })
            }}
            disabled={isPending}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="pt-2">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-700">
          Notification groups
        </h3>
        <NotificationPreferenceMatrix
          categories={categories}
          cells={matrix}
          onToggle={handleToggle}
        />
      </div>
    </div>
  )
}
