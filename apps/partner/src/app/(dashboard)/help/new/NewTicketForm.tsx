'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTicketAction } from '../actions'

// Optional guided scaffolds — inserted only on click, only when the body is empty.
const TEMPLATE_BY_SLUG: Record<string, string> = {
  'order-issue':
    "What's wrong with the order:\n\nWhat I expected:\n\nWhat I need:\n",
  'dispatch-deadline':
    'The deadline issue:\n\nDeadline agreed vs what’s shown:\n\nWhat I need:\n',
  'payment-payout':
    'What happened:\n\nPayout / amount in question:\n\nWhat I expected:\n',
  'partner-verification':
    'Which onboarding section:\n\nWhat I’m stuck on:\n\nWhat I’ve tried:\n',
}

export function NewTicketForm({
  categories,
  attachBySlug,
  dispatches,
  initialCategorySlug,
  initialDispatchId,
}: {
  categories: { slug: string; name: string; description: string | null }[]
  attachBySlug: Record<string, 'dispatch'>
  dispatches: { id: string; label: string }[]
  initialCategorySlug?: string
  initialDispatchId?: string
}) {
  const [categorySlug, setCategorySlug] = useState(
    initialCategorySlug ?? categories[0]?.slug ?? 'other',
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [dispatchId, setDispatchId] = useState(initialDispatchId ?? '')
  const [pending, start] = useTransition()

  const selected = categories.find((c) => c.slug === categorySlug)
  const showDispatch = (attachBySlug[categorySlug] ?? null) === 'dispatch'
  const template = TEMPLATE_BY_SLUG[categorySlug] ?? null

  function onCategoryChange(next: string) {
    setCategorySlug(next)
    if ((attachBySlug[next] ?? null) !== 'dispatch') setDispatchId('')
  }

  function submit() {
    if (subject.trim().length < 4) return toast.error('Add a short subject (4+ characters).')
    if (body.trim().length < 10) return toast.error('Describe the issue (10+ characters).')
    const useDispatch = showDispatch && dispatchId
    start(async () => {
      const res = await createTicketAction({
        categorySlug,
        subject: subject.trim(),
        body: body.trim(),
        entityType: useDispatch ? 'OrderDispatch' : undefined,
        entityId: useDispatch ? dispatchId : undefined,
      })
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-5">
      <Field label="What's it about?">
        <select
          value={categorySlug}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        {selected?.description && <p className="mt-1 text-[12px] text-ink-500">{selected.description}</p>}
      </Field>

      {showDispatch && dispatches.length > 0 && (
        <Field label="Related dispatch (optional)">
          <select
            value={dispatchId}
            onChange={(e) => setDispatchId(e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <option value="">Not about a specific dispatch</option>
            {dispatches.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Subject">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={180}
          placeholder="A one-line summary"
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
      </Field>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-ink-700">Details</span>
          {template && (
            <button
              type="button"
              onClick={() => setBody(template)}
              disabled={body.trim().length > 0}
              className="text-[11.5px] font-medium text-pink-700 hover:text-pink-800 disabled:cursor-not-allowed disabled:text-ink-300"
              title={body.trim().length > 0 ? 'Clear the field first to use the template' : 'Insert a guided format'}
            >
              Use a guided template
            </button>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder={
            showDispatch
              ? 'What happened with the dispatch, the deadline in question, and what you need. Markdown supported.'
              : 'What happened, what you expected, and any relevant order or dispatch IDs. Markdown is supported.'
          }
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? 'Submitting…' : 'Submit ticket'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-700">{label}</span>
      {children}
    </label>
  )
}
