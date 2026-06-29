'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Save } from 'lucide-react'
import { createMandatoryPhrase, updateMandatoryPhrase } from './actions'
import { PHRASE_CATEGORIES, PHRASE_LABELING_TYPES, PHRASE_REQUIREMENTS } from './constants'

const LABELING_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  OTC: 'OTC',
  PET_PRODUCT: 'Pet',
  BEVERAGE: 'Beverage',
  COSMETIC: 'Cosmetic',
}

export interface PhraseInitial {
  id?: string
  title: string
  body: string
  category: string
  requirement: string
  labelingTypes: string[]
  cfrCitation: string | null
  appliesWhen: string | null
  isActive: boolean
}

export function PhraseForm({ mode, initial }: { mode: 'create' | 'edit'; initial: PhraseInitial }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const res =
        mode === 'create'
          ? await createMandatoryPhrase(fd)
          : await updateMandatoryPhrase(initial.id!, fd)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(mode === 'create' ? 'Phrase created' : 'Phrase saved')
      router.push('/mandatory-phrases')
      router.refresh()
    })
  }

  const field =
    'w-full rounded-md border border-ink-300 px-2.5 py-1.5 text-ui-body focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200'
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-ink-500 mb-1'

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div>
        <label className={label}>Title</label>
        <input name="title" defaultValue={initial.title} required placeholder="DSHEA Disclaimer" className={field} />
      </div>

      <div>
        <label className={label}>Phrase body (exact text)</label>
        <textarea
          name="body"
          defaultValue={initial.body}
          required
          rows={4}
          placeholder="These statements have not been evaluated by…"
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label}>Requirement</label>
          <select name="requirement" defaultValue={initial.requirement || 'MANDATORY'} required className={field}>
            {PHRASE_REQUIREMENTS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0) + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Category</label>
          <select name="category" defaultValue={initial.category || ''} required className={field}>
            <option value="" disabled>
              Choose…
            </option>
            {PHRASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>CFR citation (optional)</label>
          <input name="cfrCitation" defaultValue={initial.cfrCitation ?? ''} placeholder="21 CFR 101.93(b)" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Applies to labeling types</label>
        <div className="flex flex-wrap gap-2">
          {PHRASE_LABELING_TYPES.map((t) => (
            <label key={t} className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-2.5 py-1 text-ui-body">
              <input
                type="checkbox"
                name="labelingTypes"
                value={t}
                defaultChecked={initial.labelingTypes.includes(t)}
                className="h-3.5 w-3.5"
              />
              {LABELING_LABEL[t] ?? t}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={label}>Applies when (trigger, optional)</label>
        <input
          name="appliesWhen"
          defaultValue={initial.appliesWhen ?? ''}
          placeholder="≥30 mg iron per serving in a solid oral dosage form."
          className={field}
        />
      </div>

      <label className="flex items-center gap-2 text-ui-body text-ink-700">
        <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="h-4 w-4 rounded border-ink-300" />
        Active (available to the compliance scanner + renderer)
      </label>

      {error && <p className="text-ui-body text-danger-600">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-ui-value text-white hover:bg-black disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mode === 'create' ? 'Create phrase' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/mandatory-phrases')}
          className="rounded-md border border-ink-300 px-4 py-2 text-ui-body hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
