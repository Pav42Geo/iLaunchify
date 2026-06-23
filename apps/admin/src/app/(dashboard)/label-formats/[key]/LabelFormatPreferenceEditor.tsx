'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { updateLabelFormatPreference } from '../actions'

export function LabelFormatPreferenceEditor({
  format,
  labelingType,
  preferenceScore,
  notes,
}: {
  format: string
  labelingType: string
  preferenceScore: number
  notes: string | null
}) {
  const router = useRouter()
  const [score, setScore] = React.useState(preferenceScore)
  const [note, setNote] = React.useState(notes ?? '')
  const [pending, start] = React.useTransition()

  const dirty = score !== preferenceScore || note !== (notes ?? '')

  function save() {
    start(async () => {
      const res = await updateLabelFormatPreference({
        format,
        labelingType,
        preferenceScore: score,
        notes: note,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Preset updated')
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
        Recommendation preference
      </h2>
      <p className="mt-1 text-[12px] text-ink-500">
        Higher score = the Studio recommends this format earlier for its labeling type + label
        surface. Regulatory thresholds above are fixed; this and the notes are admin-tunable.
      </p>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <label className="block text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
            Preference score (0–100)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-1 w-28 rounded-md border border-ink-300 px-2.5 py-1.5 text-sm tabular-nums focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
          Notes
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="When to use this format, caveats, etc."
          className="mt-1 w-full rounded-md border border-ink-300 px-2.5 py-1.5 text-[13px] leading-relaxed focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save changes
        </button>
        {dirty && !pending && <span className="text-[11.5px] text-ink-400">Unsaved changes</span>}
      </div>
    </section>
  )
}
