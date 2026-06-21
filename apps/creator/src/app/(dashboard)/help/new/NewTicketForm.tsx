'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createTicketAction } from '../actions'

type AttachKind = 'order' | 'product'
type EntityType = 'Order' | 'Product'

const KIND_TO_TYPE: Record<AttachKind, EntityType> = { order: 'Order', product: 'Product' }

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
  // The selected attachment id, scoped to the current category's attach kind.
  const [entityId, setEntityId] = useState(initialEntityId ?? '')
  const [pending, start] = useTransition()

  const selected = categories.find((c) => c.slug === categorySlug)
  const attachKind = attachBySlug[categorySlug] ?? null

  function onCategoryChange(next: string) {
    setCategorySlug(next)
    // Reset the attachment unless the new category keeps the same kind AND the
    // current selection still belongs to it.
    const nextKind = attachBySlug[next] ?? null
    if (nextKind !== attachKind) setEntityId('')
  }

  function submit() {
    if (subject.trim().length < 4) return toast.error('Add a short subject (4+ characters).')
    if (body.trim().length < 10) return toast.error('Describe the issue (10+ characters).')
    const entityType = attachKind && entityId ? KIND_TO_TYPE[attachKind] : undefined
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

  const bodyPlaceholder =
    attachKind === 'order'
      ? 'What happened with the order, what you expected, and any relevant dates. Markdown supported.'
      : attachKind === 'product'
        ? 'Which step or screen, what you expected, and how to reproduce it. Markdown supported.'
        : 'What happened, what you expected, and any steps to reproduce. Markdown is supported.'

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

      {attachKind === 'order' && orders.length > 0 && (
        <Field label="Related order (optional)">
          <EntitySelect value={entityId} onChange={setEntityId} items={orders} noneLabel="Not about a specific order" />
        </Field>
      )}
      {attachKind === 'product' && products.length > 0 && (
        <Field label="Related product (optional)">
          <EntitySelect value={entityId} onChange={setEntityId} items={products} noneLabel="Not about a specific product" />
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

      <Field label="Details">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder={bodyPlaceholder}
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        />
      </Field>

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

function EntitySelect({
  value,
  onChange,
  items,
  noneLabel,
}: {
  value: string
  onChange: (v: string) => void
  items: { id: string; label: string }[]
  noneLabel: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
    >
      <option value="">{noneLabel}</option>
      {items.map((it) => (
        <option key={it.id} value={it.id}>
          {it.label}
        </option>
      ))}
    </select>
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
