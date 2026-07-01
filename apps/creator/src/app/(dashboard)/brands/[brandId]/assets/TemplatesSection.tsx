'use client'

// Brand Templates section (docs/BRAND_KIT_PROPOSAL.md) — manage this kit's saved
// packaging/label templates: per-tier usage meter, rename, duplicate, delete. New
// templates are SAVED from the Design Studio ("Save as template"); applying one to a
// product happens in the Studio's Templates drawer. This surface is management-only.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, Trash2, Lock, Copy, Pencil, Check, X } from 'lucide-react'
import {
  deleteBrandTemplateAction,
  renameBrandTemplateAction,
  duplicateBrandTemplateAction,
} from './template-actions'

export interface BrandTemplateItem {
  id: string
  name: string
  thumbnailUrl: string | null
  createdAt: string
}

export function TemplatesSection({
  brandId,
  templates,
  used,
  cap,
}: {
  brandId: string
  templates: BrandTemplateItem[]
  used: number
  cap: number
}) {
  const router = useRouter()
  const [items, setItems] = useState(templates)
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const capLabel = Number.isFinite(cap) ? String(cap) : 'Unlimited'
  const atCap = Number.isFinite(cap) && items.length >= cap

  function remove(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await deleteBrandTemplateAction(brandId, id)
      if (res.ok) setItems((prev) => prev.filter((t) => t.id !== id))
      else setError(res.error ?? 'Could not delete template.')
      setBusyId(null)
    })
  }

  function startRename(t: BrandTemplateItem) {
    setError(null)
    setEditingId(t.id)
    setDraftName(t.name)
  }

  function saveRename(id: string) {
    const name = draftName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    setBusyId(id)
    startTransition(async () => {
      const res = await renameBrandTemplateAction(brandId, id, name)
      if (res.ok) setItems((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
      else setError(res.error ?? 'Could not rename template.')
      setBusyId(null)
      setEditingId(null)
    })
  }

  function duplicate(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const res = await duplicateBrandTemplateAction(brandId, id)
      if (res.ok) router.refresh() // reload server data to pick up the new copy
      else setError(res.error ?? 'Could not duplicate template.')
      setBusyId(null)
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink-900">
            Brand templates
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-500">
            Reusable label and packaging designs locked to this brand. Save a finished design as a
            template from the Design Studio, then start new products from it there.
          </p>
        </div>
        <span className="text-[12px] text-ink-600">
          <span className="font-semibold text-ink-900">{items.length}</span> of {capLabel} used
        </span>
      </div>

      {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-[12px] text-danger-700">{error}</p>}

      {atCap && (
        <p className="inline-flex items-center gap-1.5 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-[12px] text-warning-800">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          You&apos;ve reached your template limit for this kit. Upgrade your plan for more, or delete one.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-8 text-center">
          <LayoutTemplate className="mx-auto h-6 w-6 text-ink-400" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-ink-900">No templates yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-ink-500">
            In the Design Studio, open the menu and choose “Save as template” to reuse a design
            across products.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {items.map((t) => {
            const rowBusy = isPending && busyId === t.id
            const editing = editingId === t.id
            return (
              <div key={t.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                <div className="flex h-32 items-center justify-center bg-ink-50">
                  {t.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnailUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <LayoutTemplate className="h-7 w-7 text-ink-300" aria-hidden="true" />
                  )}
                </div>

                <div className="px-3 py-2">
                  {editing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(t.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded-md border border-ink-300 px-2 py-1 text-[13px] text-ink-900 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-200"
                        aria-label="Template name"
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(t.id)}
                        disabled={rowBusy}
                        aria-label="Save name"
                        className="shrink-0 text-ink-500 hover:text-success-600 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="shrink-0 text-ink-400 hover:text-ink-700"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink-900">{t.name}</span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => startRename(t)}
                          disabled={rowBusy}
                          aria-label={`Rename ${t.name}`}
                          className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicate(t.id)}
                          disabled={rowBusy || atCap}
                          title={atCap ? 'Template limit reached' : 'Duplicate'}
                          aria-label={`Duplicate ${t.name}`}
                          className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-ink-700 disabled:opacity-40"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(t.id)}
                          disabled={rowBusy}
                          aria-label={`Delete ${t.name}`}
                          className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-danger-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
