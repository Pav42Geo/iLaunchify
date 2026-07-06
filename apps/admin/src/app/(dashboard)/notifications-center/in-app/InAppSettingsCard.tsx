'use client'

// Global in-app behavior settings — auto-archive window (consumed by the
// /api/cron/archive-notifications sweep).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive } from 'lucide-react'
import { saveInAppSettings } from './actions'

export function InAppSettingsCard({
  initialAutoArchiveDays,
  initialDigestEnabled,
}: {
  initialAutoArchiveDays: number
  initialDigestEnabled: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [days, setDays] = useState(String(initialAutoArchiveDays))
  const [digest, setDigest] = useState(initialDigestEnabled)

  function save() {
    startTransition(async () => {
      const r = await saveInAppSettings({ autoArchiveDays: Number(days), digestEnabled: digest })
      if (r.ok) {
        toast.success('In-app settings saved')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
        <Archive className="h-4 w-4 text-ink-500" /> Feed hygiene
      </h2>
      <label className="mt-3 block max-w-xs text-[12px] font-medium text-ink-700">
        Auto-archive read notifications after (days)
        <input
          type="number"
          min={1}
          max={365}
          step={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-500">
          The daily sweep archives READ rows older than this — they leave the bell and feed
          but are never deleted. Unread rows are never auto-archived.
        </span>
      </label>
      <label className="mt-4 flex max-w-md cursor-pointer items-start gap-2.5 text-[12px] font-medium text-ink-700">
        <input
          type="checkbox"
          checked={digest}
          onChange={(e) => setDigest(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-500"
        />
        <span>
          Daily digest merge
          <span className="mt-0.5 block text-[11px] font-normal text-ink-500">
            Digest-flagged reminders (low-priority P2 events) merge into one in-app row per
            category per day instead of stacking. Realtime events are unaffected.
          </span>
        </span>
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-3 rounded-full bg-ink-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        Save
      </button>
    </section>
  )
}
