'use client'

// Shared picker for /products/new/starter and /products/new/clone.
// Lists templates as cards; clicking a card opens a modal where the partner
// names the new draft. On confirm, calls cloneTemplate() then redirects to
// /products/[id]/edit on the freshly created row.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Beaker, Package, X } from 'lucide-react'
import type { ProductTemplateStatus } from '@prisma/client'
import { cloneTemplate, type CloneSource } from '../actions'

interface TemplateOption {
  id: string
  name: string
  description: string | null
  categoryName: string
  subcategoryName: string
  ingredientCount: number
  variantCount: number
  statusBadge?: ProductTemplateStatus
}

interface TemplatePickerProps {
  source: CloneSource
  templates: TemplateOption[]
}

const STATUS_LABEL: Partial<Record<ProductTemplateStatus, string>> = {
  DRAFT: 'Draft',
  NEEDS_CHANGES: 'Needs changes',
  PENDING_REVIEW: 'In review',
  PUBLISHED: 'Live',
  PAUSED: 'Paused',
}

export function TemplatePicker({ source, templates }: TemplatePickerProps) {
  const [selected, setSelected] = useState<TemplateOption | null>(null)

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(t)}
            className="flex h-full flex-col rounded-md border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-zinc-900">{t.name}</h3>
              {t.statusBadge && STATUS_LABEL[t.statusBadge] && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">
                  {STATUS_LABEL[t.statusBadge]}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {t.categoryName} · {t.subcategoryName}
            </p>
            {t.description && (
              <p className="mt-2 line-clamp-3 text-sm text-zinc-600">{t.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Beaker className="h-3.5 w-3.5" /> {t.ingredientCount} ingredient
                {t.ingredientCount === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> {t.variantCount} variant
                {t.variantCount === 1 ? '' : 's'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <CloneModal
          source={source}
          template={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// -----------------------------------------------------------------------------
// Confirm + name modal
// -----------------------------------------------------------------------------

function CloneModal({
  source,
  template,
  onClose,
}: {
  source: CloneSource
  template: TemplateOption
  onClose: () => void
}) {
  const router = useRouter()
  const defaultName =
    source === 'STARTER' ? template.name : `${template.name} (copy)`
  const [newName, setNewName] = useState(defaultName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function clone() {
    setError(null)
    startTransition(async () => {
      const result = await cloneTemplate({
        sourceTemplateId: template.id,
        source,
        newName,
      })
      if (!result.ok) {
        setError(result.error)
        toast.error(result.error)
        return
      }
      toast.success(`Created "${newName}"`)
      router.push(`/products/${result.data.id}/edit`)
      router.refresh()
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-bold tracking-tight text-zinc-900">
          {source === 'STARTER' ? 'Clone starter' : 'Clone your template'}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          We&apos;ll copy <strong>{template.name}</strong>&apos;s ingredients, variants, and
          custom meta into a new DRAFT.
          {source === 'OWN' && (
            <> Packaging links + certificates don&apos;t copy — pick fresh for the new SKU.</>
          )}
        </p>

        <div className="mt-4 space-y-1.5">
          <Label className="text-sm font-medium text-zinc-900">New product name</Label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isPending}
            maxLength={120}
          />
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={clone}
            disabled={isPending || !newName.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending ? 'Cloning…' : 'Clone + open editor'}
          </Button>
        </div>
      </div>
    </div>
  )
}
