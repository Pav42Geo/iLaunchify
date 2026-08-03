'use client'

// Save dialog for the admin Design Studio template-author mode. Captures the library
// metadata (name, Regular/Premium, style category + tags), serializes the canvas + a
// PNG thumbnail, and writes it to the system templates brand. Container category +
// aspect bucket are pre-derived from the die-line by the route.

import * as React from 'react'
import { Crown, X } from 'lucide-react'
import { snapshotCanvasAsPng, CANVAS_PROPERTIES_TO_INCLUDE, type FabricCanvas } from '@ilaunchify/ui'
import { loadTemplateAuthorStyleOptions, saveStudioLibraryTemplate } from './template-author-actions'

interface StyleOption {
  id: string
  label: string
  facet: string
  active: boolean
}

interface Props {
  open: boolean
  canvas: FabricCanvas | null
  domain: string
  container: string | null
  aspectBucket: string | null
  onClose: () => void
  onSaved?: () => void
}

const field =
  'mt-1 w-full rounded-md border border-ink-300 bg-white px-2.5 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'
const lbl = 'text-[11px] font-semibold uppercase tracking-wide text-ink-500'

export function TemplateAuthorSaveDialog({ open, canvas, domain, container, aspectBucket, onClose, onSaved }: Props) {
  const [name, setName] = React.useState('')
  const [isPremium, setIsPremium] = React.useState(false)
  const [tier, setTier] = React.useState('agency')
  const [styles, setStyles] = React.useState<StyleOption[]>([])
  const [primaryStyleId, setPrimaryStyleId] = React.useState('')
  const [tagStyleIds, setTagStyleIds] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    loadTemplateAuthorStyleOptions(domain).then((opts) => {
      if (!cancelled) setStyles(opts)
    })
    return () => {
      cancelled = true
    }
  }, [open, domain])

  if (!open) return null

  function toggleTag(id: string) {
    setTagStyleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!canvas) return
    if (!name.trim()) {
      setError('Give the template a name.')
      return
    }
    setSaving(true)
    setError(null)
    const toObj = canvas.toObject as (p?: string[]) => object
    const canvasJson = JSON.stringify(toObj.call(canvas, Array.from(CANVAS_PROPERTIES_TO_INCLUDE)))
    const thumbnailUrl = snapshotCanvasAsPng(canvas, { multiplier: 0.5 }) || null
    const res = await saveStudioLibraryTemplate({
      name,
      canvasJson,
      thumbnailUrl,
      isPremium,
      tier: isPremium ? tier : null,
      domain,
      matchMode: 'SHAPE_FAMILY',
      targetContainerCategory: container,
      aspectBucket,
      targetSurface: null,
      primaryStyleId: primaryStyleId || null,
      tagStyleIds: [...tagStyleIds],
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Save library template</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-500 hover:bg-ink-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 inline-flex rounded-lg border border-ink-200 p-0.5">
          <button type="button" onClick={() => setIsPremium(false)} className={'rounded-md px-3 py-1.5 text-[12.5px] font-semibold ' + (!isPremium ? 'bg-ink-900 text-white' : 'text-ink-600')}>
            Regular
          </button>
          <button type="button" onClick={() => setIsPremium(true)} className={'flex items-center gap-1 rounded-md px-3 py-1.5 text-[12.5px] font-semibold ' + (isPremium ? 'bg-ink-900 text-white' : 'text-ink-600')}>
            <Crown className="h-3.5 w-3.5" /> Premium
          </button>
        </div>

        <label className={lbl}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bold Can Wrap" className={field} autoFocus />
        </label>
        <label className={lbl + ' mt-2 block'}>
          Primary style
          <select value={primaryStyleId} onChange={(e) => setPrimaryStyleId(e.target.value)} className={field}>
            <option value="">— pick a style —</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        {isPremium && (
          <label className={lbl + ' mt-2 block'}>
            Min tier
            <select value={tier} onChange={(e) => setTier(e.target.value)} className={field}>
              <option value="agency">Agency</option>
              <option value="builder">Builder+</option>
            </select>
          </label>
        )}

        {styles.length > 0 && (
          <div className="mt-3">
            <p className={lbl + ' mb-1.5'}>Extra style tags</p>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {styles
                .filter((s) => s.id !== primaryStyleId)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleTag(s.id)}
                    className={
                      'rounded-full border px-2 py-0.5 text-[10.5px] font-medium ' +
                      (tagStyleIds.has(s.id) ? 'border-success-500 bg-success-50 text-success-700' : 'border-ink-200 text-ink-600 hover:border-ink-300')
                    }
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] text-ink-400">
          Targets {container ?? 'any container'} · {aspectBucket ?? 'any shape'} · {domain}.
        </p>
        {error && <p className="mt-1 text-xs font-medium text-danger-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-ink-300 px-3 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !canvas || !name.trim()}
            className="rounded-md bg-ink-900 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save ${isPremium ? 'premium' : 'regular'} template`}
          </button>
        </div>
      </div>
    </div>
  )
}
