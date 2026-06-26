'use client'

// C8 — create / edit form for a PackagingDecorationCompatibility row.
//
// Shared by /new (category + method editable) and /edit (keys locked, only
// notes + active editable). Calls upsertCompatibility(formData) directly.

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ContainerCategory, DecorationMethod } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { upsertCompatibility } from './actions'
import {
  CONTAINER_CATEGORY_ORDER,
  CONTAINER_CATEGORY_LABEL,
  DECORATION_METHOD_ORDER,
  DECORATION_METHOD_LABEL,
  decorationKind,
} from './decoration-compatibility-data'

interface Props {
  mode: 'new' | 'edit'
  initialCategory?: ContainerCategory
  initialMethod?: DecorationMethod
  initialNotes?: string
  initialActive?: boolean
}

const KIND_LABEL = { PRIMARY: 'Primary', ACCENT: 'Accent', NONE: 'None' } as const

export function CompatForm({
  mode,
  initialCategory,
  initialMethod,
  initialNotes,
  initialActive,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [category, setCategory] = React.useState<ContainerCategory>(
    initialCategory ?? 'BOTTLE',
  )
  const [method, setMethod] = React.useState<DecorationMethod>(initialMethod ?? 'DIRECT_PRINT')
  const locked = mode === 'edit'

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    // Selects are disabled in edit mode so re-inject the locked keys.
    if (locked && initialCategory && initialMethod) {
      formData.set('containerCategory', initialCategory)
      formData.set('decorationMethod', initialMethod)
    }
    startTransition(async () => {
      const res = await upsertCompatibility(formData)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(mode === 'new' ? 'Combo created' : 'Combo updated')
      router.push('/decoration-compatibility')
      router.refresh()
    })
  }

  const kind = KIND_LABEL[decorationKind(method)]

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-ink-200 bg-white p-6">
      <div className="grid gap-5 md:grid-cols-2">
        {/* Container category */}
        <label className="block">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Container category
          </span>
          <select
            name="containerCategory"
            value={category}
            disabled={locked}
            onChange={(e) => setCategory(e.target.value as ContainerCategory)}
            className={cn(
              'mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200',
              locked && 'cursor-not-allowed bg-ink-50 text-ink-500',
            )}
          >
            {CONTAINER_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CONTAINER_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        {/* Decoration method */}
        <label className="block">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
            Decoration method
          </span>
          <select
            name="decorationMethod"
            value={method}
            disabled={locked}
            onChange={(e) => setMethod(e.target.value as DecorationMethod)}
            className={cn(
              'mt-1.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200',
              locked && 'cursor-not-allowed bg-ink-50 text-ink-500',
            )}
          >
            {DECORATION_METHOD_ORDER.map((m) => (
              <option key={m} value={m}>
                {DECORATION_METHOD_LABEL[m]} ({KIND_LABEL[decorationKind(m)]})
              </option>
            ))}
          </select>
          <span className="mt-1.5 inline-block text-[11px] text-ink-500">Kind: {kind}</span>
        </label>
      </div>

      {/* Notes */}
      <label className="block">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">
          Notes <span className="font-normal normal-case text-ink-400">(optional)</span>
        </span>
        <textarea
          name="notes"
          defaultValue={initialNotes ?? ''}
          rows={3}
          placeholder="e.g. requires gloss varnish base coat; not available below 5k MOQ…"
          className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      </label>

      {/* Active toggle */}
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initialActive ?? true}
          className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-400"
        />
        <span className="text-[13px] text-ink-800">
          Active — partners can offer this decoration on this container
        </span>
      </label>

      <div className="flex items-center gap-2 border-t border-ink-100 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-full bg-ink-900 px-5 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          {pending ? 'Saving…' : mode === 'new' ? 'Create combo' : 'Save changes'}
        </button>
        <Link
          href="/decoration-compatibility"
          className="inline-flex h-9 items-center rounded-full border border-ink-200 px-4 text-[12px] font-medium text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
