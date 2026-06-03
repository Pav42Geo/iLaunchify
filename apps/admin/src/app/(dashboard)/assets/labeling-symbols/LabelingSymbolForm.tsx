'use client'

// C7 — shared create/edit form for a LabelingSymbol.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import type { LabelingSymbolFamily, SymbolRequirement } from '@ilaunchify/db'
import { createLabelingSymbol, updateLabelingSymbol } from './actions'

export const FAMILIES: { value: LabelingSymbolFamily; label: string }[] = [
  { value: 'ATTRIBUTION', label: 'Attribution (Distributed by…)' },
  { value: 'STORAGE', label: 'Storage (refrigerate, keep frozen)' },
  { value: 'ALLERGEN', label: 'Allergen' },
  { value: 'DISCLOSURE', label: 'Disclosure (BE / bioengineered)' },
  { value: 'WARNING', label: 'Warning (Prop 65, choking)' },
  { value: 'OTHER', label: 'Other' },
]

const REQUIREMENTS: { value: SymbolRequirement; label: string }[] = [
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'RECOMMENDED', label: 'Recommended' },
  { value: 'REQUIRED', label: 'Required' },
]

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

export interface SymbolFormInitial {
  id: string
  name: string
  slug: string
  description: string | null
  family: LabelingSymbolFamily
  applicableCategorySlugs: string[]
  applicableMarkets: string[]
  requirement: SymbolRequirement
  requiredWhen: string | null
  requiredCoText: string | null
}

export function LabelingSymbolForm({ initial }: { initial?: SymbolFormInitial }) {
  const router = useRouter()
  const mode = initial ? 'edit' : 'create'
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [family, setFamily] = useState<LabelingSymbolFamily>(initial?.family ?? 'ATTRIBUTION')
  const [requirement, setRequirement] = useState<SymbolRequirement>(initial?.requirement ?? 'OPTIONAL')
  const [categories, setCategories] = useState((initial?.applicableCategorySlugs ?? []).join(', '))
  const [markets, setMarkets] = useState((initial?.applicableMarkets ?? []).join(', '))
  const [requiredWhen, setRequiredWhen] = useState(initial?.requiredWhen ?? '')
  const [requiredCoText, setRequiredCoText] = useState(initial?.requiredCoText ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onName(v: string) {
    setName(v)
    if (mode === 'create' && !slugTouched) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42))
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const payload = {
      name,
      slug,
      description,
      family,
      requirement,
      applicableCategorySlugs: categories,
      applicableMarkets: markets,
      requiredWhen,
      requiredCoText,
    }
    startTransition(async () => {
      if (initial) {
        const res = await updateLabelingSymbol({ ...payload, id: initial.id })
        if (!res.ok) {
          setError(res.error)
          return
        }
        toast.success('Saved')
        router.refresh()
        return
      }
      const res = await createLabelingSymbol(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast.success(`${name} added`)
      router.push(`/assets/labeling-symbols/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Distributed by" required disabled={isPending} />
        </Field>
        <Field label="Slug" required hint="lowercase, dashes">
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value.toLowerCase())
            }}
            required
            pattern={SLUG_REGEX.source}
            disabled={isPending || mode === 'edit'}
            className={mode === 'edit' ? 'bg-zinc-50' : ''}
          />
        </Field>
        <Field label="Family" required>
          <Select value={family} onChange={(v) => setFamily(v as LabelingSymbolFamily)} options={FAMILIES} disabled={isPending} />
        </Field>
        <Field label="Requirement">
          <Select value={requirement} onChange={(v) => setRequirement(v as SymbolRequirement)} options={REQUIREMENTS} disabled={isPending} />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          disabled={isPending}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applicable categories" hint="category slugs, comma-separated">
          <Input value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="beverages, supplements" disabled={isPending} />
        </Field>
        <Field label="Applicable markets" hint="market slugs, comma-separated">
          <Input value={markets} onChange={(e) => setMarkets(e.target.value)} placeholder="us, eu" disabled={isPending} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Required when" hint="Free-text rule">
          <Input value={requiredWhen} onChange={(e) => setRequiredWhen(e.target.value)} disabled={isPending} />
        </Field>
        <Field label="Required co-text" hint="Text that must accompany the mark">
          <Input value={requiredCoText} onChange={(e) => setRequiredCoText(e.target.value)} disabled={isPending} />
        </Field>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push('/assets/labeling-symbols')} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
          {isPending ? 'Saving…' : mode === 'create' ? 'Create symbol' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-zinc-900">
        {label}
        {required && <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">Required</span>}
      </Label>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}
