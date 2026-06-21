'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Search, ShoppingBag, Package, Check, AlertCircle, ArrowRight } from 'lucide-react'
import { createTicketAction, getEntityOpenTickets } from '../actions'

type OpenTicket = { id: string; subject: string; status: string }

type AttachKind = 'order' | 'product'
type EntityType = 'Order' | 'Product'
type AttachType = 'none' | AttachKind

const KIND_TO_TYPE: Record<AttachKind, EntityType> = { order: 'Order', product: 'Product' }

// Optional guided scaffolds for high-volume categories. Inserted only on click,
// and only when the body is empty — never auto-applied, never clobbering text.
const TEMPLATE_BY_SLUG: Record<string, string> = {
  'order-issue':
    "What's wrong:\n\nWhat I expected:\n\nWhen I first noticed:\n",
  'payment-payout':
    'What happened:\n\nAmount / charge in question:\n\nWhat I expected:\n',
  'design-studio-bug':
    'What I was doing:\n\nWhat I expected:\n\nWhat happened instead:\n\nSteps to reproduce:\n1. \n2. \n\nBrowser / device:\n',
  'product-approval':
    "The decision I'm asking about:\n\nWhat I'd like to happen:\n",
  'compliance-question':
    'My question:\n\nRelevant claim / ingredient:\n',
}

export function NewTicketForm({
  categories,
  attachBySlug,
  orders,
  products,
  initialCategorySlug,
  initialEntityType,
  initialEntityId,
}: {
  categories: { slug: string; name: string; description: string | null }[]
  attachBySlug: Record<string, AttachKind>
  orders: { id: string; label: string }[]
  products: { id: string; label: string }[]
  initialCategorySlug?: string
  initialEntityType?: EntityType
  initialEntityId?: string
}) {
  const [categorySlug, setCategorySlug] = useState(
    initialCategorySlug ?? categories[0]?.slug ?? 'other',
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  // The attachment is independent of the issue category — you can attach an order
  // or product to any ticket type, or nothing.
  const [attachType, setAttachType] = useState<AttachType>(
    initialEntityType === 'Order' ? 'order' : initialEntityType === 'Product' ? 'product' : 'none',
  )
  const [entityId, setEntityId] = useState(initialEntityId ?? '')
  const [openTickets, setOpenTickets] = useState<OpenTicket[]>([])
  const [pending, start] = useTransition()

  // Deflection: when an order/product is attached, surface existing open tickets
  // on it so the creator reuses the thread instead of opening a duplicate.
  useEffect(() => {
    if (attachType === 'none' || !entityId) {
      setOpenTickets([])
      return
    }
    let cancelled = false
    getEntityOpenTickets({ entityType: KIND_TO_TYPE[attachType], entityId })
      .then((rows) => {
        if (!cancelled) setOpenTickets(rows)
      })
      .catch(() => {
        if (!cancelled) setOpenTickets([])
      })
    return () => {
      cancelled = true
    }
  }, [attachType, entityId])

  const selected = categories.find((c) => c.slug === categorySlug)
  const template = TEMPLATE_BY_SLUG[categorySlug] ?? null

  function onCategoryChange(next: string) {
    setCategorySlug(next)
    // If nothing's attached yet, gently suggest the kind the category implies.
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
    const entityType = attachType !== 'none' && entityId ? KIND_TO_TYPE[attachType] : undefined
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
      {/* What's this about — order / product, browseable, independent of category */}
      <div>
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
          What&apos;s this about? <span className="font-normal text-ink-400">(optional)</span>
        </span>
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
          <SegBtn active={attachType === 'none'} onClick={() => chooseAttach('none')}>
            Nothing specific
          </SegBtn>
          <SegBtn active={attachType === 'order'} onClick={() => chooseAttach('order')} icon={ShoppingBag}>
            An order
          </SegBtn>
          <SegBtn active={attachType === 'product'} onClick={() => chooseAttach('product')} icon={Package}>
            A product
          </SegBtn>
        </div>

        {attachType === 'order' && (
          <EntityBrowser
            items={orders}
            value={entityId}
            onChange={setEntityId}
            emptyLabel="You don't have any orders yet."
            searchPlaceholder="Search your orders…"
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

        <DeflectionPanel tickets={openTickets} />
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
          placeholder="What happened, what you expected, and any steps to reproduce. Markdown is supported."
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

// Searchable, scrollable picker over recent orders/products. Shows a filter only
// when the list is long enough to need one.
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
        {filtered.length === 0 && (
          <li className="px-3 py-2.5 text-[12.5px] text-ink-400">No matches.</li>
        )}
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

// Deflection panel — shows existing open tickets on the attached entity so the
// creator can jump to the live thread instead of filing a duplicate.
function DeflectionPanel({ tickets }: { tickets: OpenTicket[] }) {
  if (tickets.length === 0) return null
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900">
        <AlertCircle className="h-3.5 w-3.5" />
        You already have {tickets.length === 1 ? 'an open ticket' : `${tickets.length} open tickets`} on this
      </p>
      <p className="mt-0.5 text-[11.5px] text-amber-800">
        Adding to the existing thread is usually faster than opening a new one.
      </p>
      <ul className="mt-2 space-y-1">
        {tickets.map((t) => (
          <li key={t.id}>
            <Link
              href={`/help/${t.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-[12px] font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
            >
              <span className="max-w-[280px] truncate">{t.subject}</span>
              <ArrowRight className="h-3.5 w-3.5 flex-none" />
            </Link>
          </li>
        ))}
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
