'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Search, Boxes, Package, Check } from 'lucide-react'
import { createTicketAction } from '../actions'

type AttachKind = 'dispatch' | 'product'
type AttachType = 'none' | AttachKind

const KIND_TO_ENTITY: Record<AttachKind, string> = {
  dispatch: 'OrderDispatch',
  product: 'ProductTemplate',
}

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
  products,
  initialCategorySlug,
  initialEntityType,
  initialEntityId,
}: {
  categories: { slug: string; name: string; description: string | null }[]
  attachBySlug: Record<string, AttachKind>
  dispatches: { id: string; label: string }[]
  products: { id: string; label: string }[]
  initialCategorySlug?: string
  initialEntityType?: 'OrderDispatch' | 'ProductTemplate'
  initialEntityId?: string
}) {
  const [categorySlug, setCategorySlug] = useState(
    initialCategorySlug ?? categories[0]?.slug ?? 'other',
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachType, setAttachType] = useState<AttachType>(
    initialEntityType === 'OrderDispatch'
      ? 'dispatch'
      : initialEntityType === 'ProductTemplate'
        ? 'product'
        : 'none',
  )
  const [entityId, setEntityId] = useState(initialEntityId ?? '')
  const [pending, start] = useTransition()

  const selected = categories.find((c) => c.slug === categorySlug)
  const template = TEMPLATE_BY_SLUG[categorySlug] ?? null

  function onCategoryChange(next: string) {
    setCategorySlug(next)
    if (attachType === 'none') {
      const hint = attachBySlug[next]
      if (hint) setAttachType(hint)
    }
  }

  function chooseAttach(next: AttachType) {
    setAttachType(next)
    setEntityId('')
  }

  function submit() {
    if (subject.trim().length < 4) {
      toast.error('Add a short subject (4+ characters).')
      return
    }
    if (body.trim().length < 10) {
      toast.error('Describe the issue (10+ characters).')
      return
    }
    const entityType = attachType !== 'none' && entityId ? KIND_TO_ENTITY[attachType] : undefined
    start(async () => {
      const res = await createTicketAction({
        categorySlug,
        subject: subject.trim(),
        body: body.trim(),
        entityType,
        entityId: entityType ? entityId : undefined,
      })
      if (res && !res.ok) toast.error(res.error)
    })
  }

  return (
    <div className="space-y-5 rounded-2xl border border-ink-200 bg-white p-5">
      <div>
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
          What&apos;s this about? <span className="font-normal text-ink-400">(optional)</span>
        </span>
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
          <SegBtn active={attachType === 'none'} onClick={() => chooseAttach('none')}>
            Nothing specific
          </SegBtn>
          <SegBtn active={attachType === 'dispatch'} onClick={() => chooseAttach('dispatch')} icon={Boxes}>
            An order
          </SegBtn>
          <SegBtn active={attachType === 'product'} onClick={() => chooseAttach('product')} icon={Package}>
            A product
          </SegBtn>
        </div>

        {attachType === 'dispatch' && (
          <EntityBrowser
            items={dispatches}
            value={entityId}
            onChange={setEntityId}
            emptyLabel="You don't have any order dispatches yet."
            searchPlaceholder="Search your dispatches…"
          />
        )}
        {attachType === 'product' && (
          <EntityBrowser
            items={products}
            value={entityId}
            onChange={setEntityId}
            emptyLabel="You don't have any products yet."
            searchPlaceholder="Search your products…"
          />
        )}
      </div>

      <Field label="Issue type">
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
          placeholder="What happened, what you expected, and any relevant details. Markdown is supported."
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

function EntityBrowser({
  items,
  value,
  onChange,
  emptyLabel,
  searchPlaceholder,
}: {
  items: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
  emptyLabel: string
  searchPlaceholder: string
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((it) => it.label.toLowerCase().includes(needle))
  }, [items, q])

  if (items.length === 0) {
    return <p className="mt-2 rounded-lg border border-dashed border-ink-200 px-3 py-2.5 text-[12.5px] text-ink-500">{emptyLabel}</p>
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-ink-200">
      {items.length > 6 && (
        <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2">
          <Search className="h-3.5 w-3.5 flex-none text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-400"
          />
        </div>
      )}
      <ul className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && <li className="px-3 py-2.5 text-[12.5px] text-ink-400">No matches.</li>}
        {filtered.map((it) => {
          const active = it.id === value
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onChange(active ? '' : it.id)}
                className={
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors ' +
                  (active ? 'bg-pink-50 text-pink-800' : 'text-ink-700 hover:bg-ink-50')
                }
              >
                <span className="truncate">{it.label}</span>
                {active && <Check className="h-3.5 w-3.5 flex-none text-pink-600" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SegBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
        (active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')
      }
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
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
