'use client'

// In-app notification sound manager (Pavel 2026-07-06) — toggle the bell's
// ping, upload a custom mp3, preview it, reset to the bundled default.
// Self-contained (separate from BrandingForm — that's email chrome; this is
// the in-app channel's one audible knob).

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Play, Upload, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { uploadNotificationSound, setNotificationSound } from './actions'

const DEFAULT_SOUND_URL = '/sounds/notification.mp3'

export function NotificationSoundCard({
  initialEnabled,
  initialUrl,
}: {
  initialEnabled: boolean
  /** Custom mp3 URL, or null = bundled default. */
  initialUrl: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [url, setUrl] = useState(initialUrl)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const effectiveUrl = url ?? DEFAULT_SOUND_URL

  function play() {
    void new Audio(effectiveUrl).play().catch(() => {
      toast.error('Could not play — check the file URL')
    })
  }

  function toggle(next: boolean) {
    setEnabled(next)
    startTransition(async () => {
      const r = await setNotificationSound({ enabled: next })
      if (r.ok) {
        toast.success(next ? 'Notification sound on' : 'Notification sound off')
        router.refresh()
      } else {
        setEnabled(!next)
        toast.error(r.error)
      }
    })
  }

  function reset() {
    startTransition(async () => {
      const r = await setNotificationSound({ enabled, resetToDefault: true })
      if (r.ok) {
        setUrl(null)
        toast.success('Reset to the default sound')
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  function upload(file: File) {
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const r = await uploadNotificationSound(fd)
      if (r.ok) {
        setUrl(r.url)
        toast.success('Custom sound uploaded — playing preview')
        void new Audio(r.url).play().catch(() => {})
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink-900">
            In-app notification sound
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-500">
            The bell plays this ping when new notifications arrive (all three apps).
            {url ? ' Using a custom upload.' : ' Using the bundled default.'}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => toggle(!enabled)}
          aria-pressed={enabled}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            enabled
              ? 'bg-ink-900 text-white hover:bg-ink-800'
              : 'border border-ink-200 bg-white text-ink-500 hover:border-ink-400'
          }`}
        >
          {enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {enabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={play}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400"
        >
          <Play className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400"
        >
          <Upload className="h-3.5 w-3.5" /> Upload MP3
        </button>
        {url && (
          <button
            type="button"
            disabled={pending}
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,.mp3"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        MP3, max 1 MB. Keep it short and gentle — it plays on every new notification.
      </p>
    </section>
  )
}
