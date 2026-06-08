'use client'

// Step 0 (Basics) of the guided turnkey builder. Captures the minimum to spin
// up a DRAFT (name + category/subcategory → FDA rule pack), then hands off to
// the rich editor in guided mode (`/products/[id]/edit?mode=guided`), where the
// remaining steps (Variants → Recipe → Packaging → Pricing → Review) are the
// editor's existing cards presented one at a time.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Label } from '@ilaunchify/ui'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { createDraftShell } from './build-actions'

interface CategoryOption {
  id: string
  name: string
  mainCategory: string
}
interface SubcategoryOption {
  id: string
  name: string
  categoryId: string
}

interface BasicsStepProps {
  categories: CategoryOption[]
  subcategories: SubcategoryOption[]
}

// The full guided journey — shown as a rail so the partner sees what's ahead.
// Steps 1–5 run in the editor's guided mode.
const STEPS = [
  'Basics',
  'Variants & packs',
  'Recipe builder',
  'Packaging & die-lines',
  'Cost & pricing',
  'Review & submit',
] as const

export function BasicsStep({ categories, subcategories }: BasicsStepProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [isPending, startTransition] = useTransition()

  const filteredSubs = useMemo(
    () => subcategories.filter((s) => s.categoryId === categoryId),
    [categoryId, subcategories],
  )

  const canContinue = name.trim().length >= 2 && !!subcategoryId

  function handleContinue() {
    if (!canContinue) return
    startTransition(async () => {
      const res = await createDraftShell({ name: name.trim(), subcategoryId })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Draft "${name.trim()}" created`)
      router.push(`/products/${res.data.id}/edit?mode=guided`)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px,1fr]">
      {/* Journey rail */}
      <nav aria-label="Builder steps">
        <ol className="space-y-1">
          {STEPS.map((label, i) => {
            const current = i === 0
            return (
              <li key={label}>
                <div
                  className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${
                    current ? 'bg-[#FBEAF0] ring-1 ring-[#F4C0D1]' : ''
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      current ? 'bg-ink-900 text-white' : 'border border-ink-300 bg-white text-ink-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={`text-sm font-medium ${current ? 'text-ink-900' : 'text-ink-400'}`}>
                    {label}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 px-3 text-[10.5px] leading-snug text-ink-400">
          Steps 2–6 open in the builder once your draft exists.
        </p>
      </nav>

      {/* Basics form */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">What is it?</h2>
        <p className="mt-1 text-sm text-ink-500">
          Just the essentials to get started — you&apos;ll build the recipe, variants, packaging,
          and pricing in the next steps.
        </p>

        <div className="mt-5 space-y-5">
          <Field label="Product name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Whey Protein Powder"
              maxLength={120}
              autoFocus
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value)
                  setSubcategoryId('')
                }}
                className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mainCategory})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subcategory" required>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                disabled={!categoryId}
                className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-ink-50 disabled:text-ink-400"
              >
                <option value="">{categoryId ? 'Select…' : 'Pick a category first'}</option>
                {filteredSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="rounded-lg bg-pink-50 px-3 py-2 text-xs text-pink-700">
            The subcategory selects the right FDA rule pack — Food, Supplement, and Pet labels each
            have different requirements — and locks the panel type in the editor so you can&apos;t
            ship a mismatched Facts panel.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
          {!canContinue && (
            <p className="text-xs text-amber-700">Add a name + category to continue.</p>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue || isPending}
            className="inline-flex items-center rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-700 disabled:bg-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {isPending ? (
              'Creating…'
            ) : (
              <>
                Create draft & start building <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-ink-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-pink-700">
            Required
          </span>
        )}
      </Label>
      {children}
    </div>
  )
}

// Keep a named export of the step list so the editor's guided mode can mirror it.
export const GUIDED_BUILDER_STEPS = STEPS
