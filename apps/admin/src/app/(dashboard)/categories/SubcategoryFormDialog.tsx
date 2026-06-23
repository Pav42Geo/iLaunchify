'use client'

// =============================================================================
// SubcategoryFormDialog — add OR edit a Subcategory in a tiny modal.
// =============================================================================

import { useId, useState, useTransition } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { createSubcategory, updateSubcategory } from './actions'

export function SubcategoryFormDialog({
  mode,
  categoryId,
  subcategory,
  trigger,
}: {
  mode: 'create' | 'edit'
  categoryId: string
  subcategory?: {
    id: string
    name: string
    description: string | null
  }
  trigger?: 'pill' | 'inline-add' | 'pencil'
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const name = String(formData.get('name') ?? '')
      const description = String(formData.get('description') ?? '')

      const res =
        mode === 'create'
          ? await createSubcategory({ categoryId, name, description })
          : await updateSubcategory(subcategory!.id, { name, description })

      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
    })
  }

  const triggerKind = trigger ?? (mode === 'create' ? 'pill' : 'pencil')

  return (
    <>
      {triggerKind === 'pill' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12.5px] font-semibold text-ink-900 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" /> Add subcategory
        </button>
      ) : triggerKind === 'inline-add' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-pink-700 transition-colors hover:text-pink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${subcategory?.name ?? 'subcategory'}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
        >
          <Pencil className="h-3 w-3" />
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
                {mode === 'create' ? 'New subcategory' : 'Edit subcategory'}
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
              <Field label="Name" name="name" required defaultValue={subcategory?.name ?? ''} />
              <Field
                label="Description"
                name="description"
                multiline
                defaultValue={subcategory?.description ?? ''}
              />
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
  required,
  multiline,
}: {
  label: string
  name: string
  defaultValue?: string
  required?: boolean
  multiline?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700"
      >
        {label}
        {required && <span className="ml-1 text-pink-500">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          defaultValue={defaultValue}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      ) : (
        <input
          id={id}
          name={name}
          defaultValue={defaultValue}
          required={required}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      )}
    </div>
  )
}

// =============================================================================
// "+ Add Subcategory" header pill needs a parent picker too. We expose a
// header variant that lets the admin pick the parent category inline before
// continuing — defers to createSubcategory once they pick.
// =============================================================================

export function SubcategoryHeaderPickerDialog({
  parents,
}: {
  parents: { id: string; name: string; mainCategory: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()

  function handleSubmit(formData: FormData) {
    setError(null)
    if (!chosen) {
      setError('Pick a category first.')
      return
    }
    const name = String(formData.get('name') ?? '')
    const description = String(formData.get('description') ?? '')
    startTransition(async () => {
      const res = await createSubcategory({ categoryId: chosen, name, description })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      setChosen(null)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12.5px] font-semibold text-ink-900 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
      >
        <Plus className="h-3.5 w-3.5" /> Add subcategory
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false)
              setChosen(null)
            }
          }}
        >
          <form
            action={handleSubmit}
            className="w-full max-w-md rounded-2xl border border-ink-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <h2 id={titleId} className="font-display text-[15px] font-semibold text-ink-900">
                New subcategory
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setChosen(null)
                }}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div>
                <label
                  htmlFor="parent"
                  className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700"
                >
                  Parent category <span className="text-pink-500">*</span>
                </label>
                <select
                  id="parent"
                  value={chosen ?? ''}
                  onChange={(e) => setChosen(e.target.value || null)}
                  className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  <option value="">Pick a category…</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.mainCategory} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Name" name="name" required />
              <Field label="Description" name="description" multiline />
              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setChosen(null)
                }}
                className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
              >
                {pending ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
