'use client'

// =============================================================================
// NicheEditDialog — pencil-button modal for editing a locked niche row.
// =============================================================================
//
// The 8 niches are vocabulary-locked. Admin can edit name / description /
// iconEmoji / accentHex / displayOrder, NOT create or delete.

import { useId, useState, useTransition } from 'react'
import { Pencil, X } from 'lucide-react'
import { updateNiche } from './actions'

export function NicheEditDialog({
  niche,
}: {
  niche: {
    id: string
    name: string
    description: string | null
    iconEmoji: string | null
    accentHex: string | null
    displayOrder: number
  }
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const titleId = useId()
  const [accentDraft, setAccentDraft] = useState(niche.accentHex ?? '')

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const name = String(formData.get('name') ?? '')
      const description = String(formData.get('description') ?? '')
      const iconEmoji = String(formData.get('iconEmoji') ?? '')
      const accentHex = String(formData.get('accentHex') ?? '')
      const displayOrderRaw = String(formData.get('displayOrder') ?? '')
      const displayOrder = Number.parseInt(displayOrderRaw, 10)

      const res = await updateNiche(niche.id, {
        name,
        description,
        iconEmoji,
        accentHex,
        displayOrder: Number.isFinite(displayOrder) ? displayOrder : undefined,
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${niche.name}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

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
                Edit niche
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
              <Field label="Name" name="name" required defaultValue={niche.name} />
              <Field
                label="Description"
                name="description"
                multiline
                defaultValue={niche.description ?? ''}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Icon emoji"
                  name="iconEmoji"
                  defaultValue={niche.iconEmoji ?? ''}
                  placeholder=""
                  hint="Single emoji"
                />
                <div>
                  <label
                    htmlFor={`${titleId}-accent`}
                    className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700"
                  >
                    Accent (hex)
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id={`${titleId}-accent`}
                      name="accentHex"
                      value={accentDraft}
                      onChange={(e) => setAccentDraft(e.target.value)}
                      placeholder="#FF2E63"
                      className="block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
                    />
                    <span
                      aria-hidden="true"
                      className="inline-block h-7 w-7 shrink-0 rounded-full border border-ink-200"
                      style={{ backgroundColor: /^#?[0-9a-fA-F]{3,8}$/.test(accentDraft.trim()) ? (accentDraft.trim().startsWith('#') ? accentDraft.trim() : `#${accentDraft.trim()}`) : '#fff' }}
                    />
                  </div>
                </div>
              </div>
              <Field
                label="Display order"
                name="displayOrder"
                defaultValue={String(niche.displayOrder)}
                type="number"
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
                className="inline-flex h-8 items-center rounded-full border border-ink-200 px-3 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-8 items-center rounded-full bg-ink-900 px-4 text-[12px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
              >
                {pending ? 'Saving…' : 'Save changes'}
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
  hint,
  type,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
  hint?: string
  type?: string
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
          placeholder={placeholder}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type ?? 'text'}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
      )}
      {hint && <p className="mt-1 text-[10.5px] text-ink-500">{hint}</p>}
    </div>
  )
}
