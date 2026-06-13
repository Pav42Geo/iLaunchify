'use client'

// =============================================================================
// CategoryFormDialog — add OR edit a Category in a tiny modal.
// =============================================================================
//
// Used in two modes:
//   - "create": dialog mounted by the "+ Add Category" header pill
//   - "edit":   dialog mounted by the per-card pencil button
//
// We use a plain <dialog> element rather than a portal — keeps this
// component dependency-free and lets the server actions live in
// ../actions.ts. Toasts on error via a tiny inline error string.

import { useId, useState, useTransition } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { createCategory, updateCategory } from './actions'

const MAIN_CATEGORY_OPTIONS = ['Food', 'Beverages', 'Supplements', 'Other'] as const

// Product domain (LabelingType) drives the New Product flow + the label regime.
const DOMAIN_OPTIONS = [
  { value: 'FOOD', label: 'Food / Beverage — Nutrition Facts' },
  { value: 'DIETARY_SUPPLEMENT', label: 'Supplement — Supplement Facts' },
  { value: 'COSMETIC', label: 'Cosmetic — INCI declaration' },
  { value: 'PET_PRODUCT', label: 'Pet — Guaranteed Analysis' },
  { value: 'OTC', label: 'OTC drug — Drug Facts' },
] as const

export function CategoryFormDialog({
  mode,
  category,
}: {
  mode: 'create' | 'edit'
  category?: {
    id: string
    name: string
    mainCategory: string
    labelingType: string
    description: string | null
    icon: string | null
    color: string | null
    isActive: boolean
  }
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const name = String(formData.get('name') ?? '')
      const mainCategory = String(formData.get('mainCategory') ?? 'Food')
      const labelingType = String(formData.get('labelingType') ?? 'FOOD')
      const description = String(formData.get('description') ?? '')
      const icon = String(formData.get('icon') ?? '')
      const color = String(formData.get('color') ?? '')
      const isActive = formData.get('isActive') === 'on'

      const res =
        mode === 'create'
          ? await createCategory({ name, mainCategory, labelingType, description, icon, color, isActive })
          : await updateCategory(category!.id, {
              name,
              mainCategory,
              labelingType,
              description,
              icon,
              color,
              isActive,
            })

      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
    })
  }

  return (
    <>
      {mode === 'create' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add category
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${category?.name ?? 'category'}`}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <form
            action={handleSubmit}
            className="w-full max-w-md rounded-2xl border border-ink-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <h2 id={titleId} className="font-display text-[15px] font-semibold text-ink-900">
                {mode === 'create' ? 'New category' : 'Edit category'}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <Field label="Name" name="name" required defaultValue={category?.name ?? ''} />
              <div>
                <label
                  htmlFor="mainCategory"
                  className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                >
                  Main category
                </label>
                <select
                  id="mainCategory"
                  name="mainCategory"
                  defaultValue={category?.mainCategory ?? 'Food'}
                  className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  {MAIN_CATEGORY_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="labelingType"
                  className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
                >
                  Product domain
                </label>
                <select
                  id="labelingType"
                  name="labelingType"
                  defaultValue={category?.labelingType ?? 'FOOD'}
                  className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  {DOMAIN_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10.5px] leading-snug text-ink-500">
                  Controls which New Product flow + label panel this category uses. Products can only be
                  filed under a category matching their domain.
                </p>
              </div>
              <Field
                label="Description"
                name="description"
                multiline
                defaultValue={category?.description ?? ''}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Icon (emoji)"
                  name="icon"
                  defaultValue={category?.icon ?? ''}
                  placeholder=""
                />
                <Field
                  label="Color (hex)"
                  name="color"
                  defaultValue={category?.color ?? ''}
                  placeholder="#FF2E63"
                />
              </div>

              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={category?.isActive ?? true}
                  className="h-4 w-4 rounded border-ink-300 text-pink-600 focus:ring-pink-200"
                />
                <span className="text-[12.5px] text-ink-700">
                  Active — fileable in the product flow. Uncheck to hide this category (e.g. Gift &amp; Seasonal).
                </span>
              </label>

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                {pending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  multiline,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500"
      >
        {label}
        {required && <span className="ml-1 text-pink-500">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      ) : (
        <input
          id={id}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      )}
    </div>
  )
}
