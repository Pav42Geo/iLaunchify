'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { AcademyAudience } from '@ilaunchify/db'
import { createCategory } from '../../admin-actions'

export function NewCategoryForm() {
  const router = useRouter()
  const [audience, setAudience] = useState<AcademyAudience>('CREATOR')
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  function create() {
    if (!name.trim()) return toast.error('Enter a topic name.')
    start(async () => {
      const res = await createCategory({ audience, name })
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Topic created.')
      router.push(`/academy/categories/${res.data.id}/edit`)
    })
  }

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-ink-200 bg-white p-6">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Academy</span>
        <div className="mt-2 flex gap-2">
          {(['CREATOR', 'PARTNER'] as AcademyAudience[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={cn(
                'flex-1 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
                audience === a ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
              )}
            >
              <span className="block text-[13px] font-semibold">{a === 'CREATOR' ? 'Creator' : 'Partner'}</span>
              <span className={cn('block text-[11px]', audience === a ? 'text-white/70' : 'text-ink-500')}>
                {a === 'CREATOR' ? '/academy' : '/business/academy'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Getting started"
          className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
        />
      </label>

      <button
        type="button"
        onClick={create}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Create draft
      </button>
    </div>
  )
}
