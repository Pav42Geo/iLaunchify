'use client'

// =============================================================================
// RuleFormDialog — create + edit form for a NicheRule.
// =============================================================================
//
// Holds the dynamic condition builder. Each row picks a NicheRuleConditionKind
// and a multi-select that adapts to the kind:
//   LABELING_TYPE → fixed 5 options
//   CATEGORY      → category options (server-fed)
//   SUBCATEGORY   → subcategory options w/ category prefix (server-fed)
//   CERT_ATTACHED → certificateType slugs (server-fed, fallback free-text)
//   LIFESTYLE_TAG → lifestyleTag slugs (server-fed)

import { useId, useMemo, useState, useTransition } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { NicheRuleConditionKind } from '@ilaunchify/marketplace'
import {
  createNicheRule,
  type RuleConditionInput,
  updateNicheRule,
} from './actions'

export interface OptionEntry {
  value: string // the slug or enum-value stored in conditions.values
  label: string
  group?: string // optional group prefix (e.g. category for subcategory entries)
}

interface RuleEditState {
  id: string
  slug: string
  nicheId: string
  description: string
  weight: number
  isLocked: boolean
  isActive: boolean
  conditions: RuleConditionInput[]
}

interface NicheOption {
  id: string
  name: string
  slug: string
}

interface RuleFormDialogProps {
  niches: NicheOption[]
  options: {
    LABELING_TYPE: OptionEntry[]
    CATEGORY: OptionEntry[]
    SUBCATEGORY: OptionEntry[]
    CERT_ATTACHED: OptionEntry[]
    LIFESTYLE_TAG: OptionEntry[]
  }
  // When `existing` is undefined, we're in create mode.
  existing?: RuleEditState
  // Optional: render a different trigger button (e.g. pencil vs black pill).
  trigger?: 'create-pill' | 'edit-icon'
}

const CONDITION_KIND_LABELS: Record<NicheRuleConditionKind, string> = {
  LABELING_TYPE: 'Labeling type',
  CATEGORY: 'Category',
  SUBCATEGORY: 'Subcategory',
  CERT_ATTACHED: 'Cert attached',
  LIFESTYLE_TAG: 'Lifestyle tag',
}

const CONDITION_KIND_ORDER: NicheRuleConditionKind[] = [
  'LABELING_TYPE',
  'CATEGORY',
  'SUBCATEGORY',
  'CERT_ATTACHED',
  'LIFESTYLE_TAG',
]

export function RuleFormDialog(props: RuleFormDialogProps) {
  const isEdit = !!props.existing
  const trigger = props.trigger ?? (isEdit ? 'edit-icon' : 'create-pill')

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  const initial: RuleEditState = props.existing ?? {
    id: '',
    slug: '',
    nicheId: props.niches[0]?.id ?? '',
    description: '',
    weight: 50,
    isLocked: false,
    isActive: true,
    conditions: [{ kind: 'LABELING_TYPE', values: [] }],
  }

  const [nicheId, setNicheId] = useState(initial.nicheId)
  const [slug, setSlug] = useState(initial.slug)
  const [description, setDescription] = useState(initial.description)
  const [weight, setWeight] = useState(initial.weight)
  const [isLocked, setIsLocked] = useState(initial.isLocked)
  const [isActive, setIsActive] = useState(initial.isActive)
  const [conditions, setConditions] = useState<RuleConditionInput[]>(initial.conditions)

  function reset() {
    setNicheId(initial.nicheId)
    setSlug(initial.slug)
    setDescription(initial.description)
    setWeight(initial.weight)
    setIsLocked(initial.isLocked)
    setIsActive(initial.isActive)
    setConditions(initial.conditions)
    setError(null)
  }

  function handleClose() {
    setOpen(false)
    setError(null)
  }

  function addCondition() {
    setConditions((prev) => [...prev, { kind: 'LABELING_TYPE', values: [] }])
  }
  function removeCondition(idx: number) {
    setConditions((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateConditionKind(idx: number, kind: NicheRuleConditionKind) {
    setConditions((prev) =>
      prev.map((c, i) => (i === idx ? { kind, values: [] } : c)),
    )
  }
  function toggleConditionValue(idx: number, value: string) {
    setConditions((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c
        const has = c.values.includes(value)
        return { ...c, values: has ? c.values.filter((v) => v !== value) : [...c.values, value] }
      }),
    )
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const payload = {
        nicheId,
        slug: slug.trim() || undefined,
        description: description.trim(),
        weight,
        isLocked,
        isActive,
        conditions,
      }
      const res = isEdit
        ? await updateNicheRule(initial.id, payload)
        : await createNicheRule(payload)
      if (!res.ok) {
        setError(res.error)
        return
      }
      handleClose()
      if (!isEdit) reset()
    })
  }

  return (
    <>
      {trigger === 'create-pill' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Edit rule"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/30 px-4 py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div>
                <h2 id={titleId} className="font-display text-[16px] font-semibold text-ink-900">
                  {isEdit ? 'Edit rule' : 'New auto-assignment rule'}
                </h2>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  Conditions are AND across rows, OR within values per row.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`${titleId}-niche`}
                    className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                  >
                    Niche
                    <span className="ml-1 text-pink-500">*</span>
                  </label>
                  <select
                    id={`${titleId}-niche`}
                    value={nicheId}
                    onChange={(e) => setNicheId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  >
                    {props.niches.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`${titleId}-slug`}
                    className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                  >
                    Slug (kebab) — auto-derived if blank
                  </label>
                  <input
                    id={`${titleId}-slug`}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="auto from description"
                    className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`${titleId}-desc`}
                  className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                >
                  Description
                  <span className="ml-1 text-pink-500">*</span>
                </label>
                <textarea
                  id={`${titleId}-desc`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Pet products always surface in Pet Wellness"
                  className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${titleId}-weight`}
                    className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                  >
                    Weight (0–100)
                    <span className="font-display text-[13px] font-semibold tabular-nums text-ink-900">
                      {weight}
                    </span>
                  </label>
                  <input
                    id={`${titleId}-weight`}
                    type="range"
                    min={0}
                    max={100}
                    value={weight}
                    onChange={(e) => setWeight(Number.parseInt(e.target.value, 10) || 0)}
                    className="mt-2 block w-full accent-pink-500"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-900">
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={(e) => setIsLocked(e.target.checked)}
                      className="h-3.5 w-3.5 accent-pink-500"
                    />
                    Locked
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-900">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-3.5 w-3.5 accent-pink-500"
                    />
                    Active
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-ink-200 bg-zinc-50/40">
                <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                    Conditions ({conditions.length})
                  </p>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-200 bg-white px-3 text-[11px] font-semibold text-ink-700 hover:bg-ink-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add condition
                  </button>
                </div>
                <div className="space-y-3 px-3 py-3">
                  {conditions.length === 0 && (
                    <p className="text-[12px] italic text-ink-500">
                      Add at least one condition.
                    </p>
                  )}
                  {conditions.map((c, idx) => (
                    <ConditionRow
                      key={idx}
                      condition={c}
                      options={props.options}
                      onChangeKind={(kind) => updateConditionKind(idx, kind)}
                      onToggleValue={(value) => toggleConditionValue(idx, value)}
                      onRemove={() => removeCondition(idx)}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50"
              >
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// -----------------------------------------------------------------------------
// ConditionRow — kind picker + multi-select that adapts to kind
// -----------------------------------------------------------------------------

function ConditionRow({
  condition,
  options,
  onChangeKind,
  onToggleValue,
  onRemove,
}: {
  condition: RuleConditionInput
  options: RuleFormDialogProps['options']
  onChangeKind: (kind: NicheRuleConditionKind) => void
  onToggleValue: (value: string) => void
  onRemove: () => void
}) {
  const kindOptions: OptionEntry[] =
    (options as Record<NicheRuleConditionKind, OptionEntry[]>)[condition.kind] ?? []

  // Group subcategory options by their `group` (Category name).
  const grouped = useMemo(() => {
    if (condition.kind !== 'SUBCATEGORY') return null
    const map = new Map<string, OptionEntry[]>()
    for (const o of kindOptions) {
      const key = o.group ?? '·'
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [condition.kind, kindOptions])

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <select
          value={condition.kind}
          onChange={(e) => onChangeKind(e.target.value as NicheRuleConditionKind)}
          className="block rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          {CONDITION_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {CONDITION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[10.5px] uppercase tracking-[0.08em] text-ink-400">
          {condition.values.length} selected · OR within
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove condition"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-ink-100 bg-zinc-50/40 p-2">
        {grouped ? (
          <div className="space-y-2">
            {grouped.map(([groupLabel, items]) => (
              <div key={groupLabel}>
                <p className="text-[10px] uppercase tracking-[0.1em] text-ink-400">
                  {groupLabel}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {items.map((o) => {
                    const checked = condition.values.includes(o.value)
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onToggleValue(o.value)}
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                          checked
                            ? 'border-pink-400 bg-pink-50 text-pink-900'
                            : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : kindOptions.length === 0 ? (
          <p className="px-1 py-2 text-[11.5px] italic text-ink-500">
            No options available for {CONDITION_KIND_LABELS[condition.kind]}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {kindOptions.map((o: OptionEntry) => {
              const checked = condition.values.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggleValue(o.value)}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    checked
                      ? 'border-pink-400 bg-pink-50 text-pink-900'
                      : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
