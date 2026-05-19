'use client'

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type { NotificationChannel, NotificationEvent } from '@prisma/client'
import { togglePreference, saveQuietHours } from './actions'

interface EffectivePreference {
  event: NotificationEvent
  channel: NotificationChannel
  enabled: boolean
}

interface EventDef {
  value: NotificationEvent
  label: string
  help: string
}

interface Props {
  preferences: EffectivePreference[]
  events: EventDef[]
  quietHoursStartUtc: number | null
  quietHoursEndUtc: number | null
}

function minutesToHHMM(min: number | null): string {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function hhmmToMinutes(s: string): number | null {
  if (!s) return null
  const [h, m] = s.split(':').map((p) => parseInt(p, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function PreferencesForm({
  preferences,
  events,
  quietHoursStartUtc,
  quietHoursEndUtc,
}: Props) {
  const [prefs, setPrefs] = useState(preferences)
  const [quietStart, setQuietStart] = useState(minutesToHHMM(quietHoursStartUtc))
  const [quietEnd, setQuietEnd] = useState(minutesToHHMM(quietHoursEndUtc))
  const [isPending, startTransition] = useTransition()

  function isEnabled(event: NotificationEvent, channel: NotificationChannel): boolean {
    return prefs.find((p) => p.event === event && p.channel === channel)?.enabled ?? true
  }

  function handleToggle(event: NotificationEvent, channel: NotificationChannel, enabled: boolean) {
    setPrefs((prev) =>
      prev.map((p) =>
        p.event === event && p.channel === channel ? { ...p, enabled } : p,
      ),
    )
    startTransition(async () => {
      await togglePreference({ event, channel, enabled })
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
          <Label htmlFor="quiet-start" className="text-xs uppercase tracking-wide text-zinc-500">
            Start (UTC)
          </Label>
          <Input
            id="quiet-start"
            type="time"
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quiet-end" className="text-xs uppercase tracking-wide text-zinc-500">
            End (UTC)
          </Label>
          <Input
            id="quiet-end"
            type="time"
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value)}
            className="w-32"
          />
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

      <div className="pt-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Notification types
        </h3>
        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="w-24 px-4 py-2 text-center">In app</th>
                <th className="w-24 px-4 py-2 text-center">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {events.map((e) => (
                <tr key={e.value}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">{e.label}</div>
                    <div className="text-xs text-zinc-500">{e.help}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isEnabled(e.value, 'IN_APP')}
                      onChange={(ev) => handleToggle(e.value, 'IN_APP', ev.target.checked)}
                      disabled={isPending}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isEnabled(e.value, 'EMAIL')}
                      onChange={(ev) => handleToggle(e.value, 'EMAIL', ev.target.checked)}
                      disabled={isPending}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
