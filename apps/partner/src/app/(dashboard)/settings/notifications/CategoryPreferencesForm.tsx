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
import { Bell, Clock } from 'lucide-react'
import { Fieldset } from '@/components/panel-kit'
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
    <div>
      <Fieldset icon={<Clock />} title="Quiet hours (email)">
        <p className="mb-4 text-[12px] text-ink-500">
          Times are in UTC. Emails skipped during this window won&apos;t be re-sent later
          (you&apos;ll see them in the bell when you check next).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="quiet-start" className="mb-1.5 block text-[12px] font-semibold text-ink-700">
              Start (UTC)
            </Label>
            <Input id="quiet-start" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="w-32" />
          </div>
          <div>
            <Label htmlFor="quiet-end" className="mb-1.5 block text-[12px] font-semibold text-ink-700">
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
      </Fieldset>

      <Fieldset icon={<Bell />} title="Notification groups" hint="Required groups can't be turned off">
        <NotificationPreferenceMatrix
          categories={categories}
          cells={matrix}
          onToggle={handleToggle}
        />
      </Fieldset>
    </div>
  )
}
