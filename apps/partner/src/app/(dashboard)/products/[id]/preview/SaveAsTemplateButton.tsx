'use client'

// "Save as template" — clones this product into a fresh DRAFT so the partner
// reuses most parameters (ingredients, variants, custom meta) for a new SKU.
// Reuses the existing cloneTemplate server action; on success routes into the
// new draft's editor.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { cloneTemplate } from '../../actions'

export function SaveAsTemplateButton({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    const newName = window.prompt('Name for the new template', `${sourceName} (copy)`)
    if (!newName || !newName.trim()) return
    setBusy(true)
    try {
      const r = await cloneTemplate({ sourceTemplateId: sourceId, source: 'OWN', newName: newName.trim() })
      if (!r.ok) {
        toast.error(r.error ?? 'Could not save as template')
        return
      }
      toast.success(`Template “${newName.trim()}” created — opening editor`)
      router.push(`/products/${r.data.id}/edit`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-full border border-ink-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-ink-800 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:opacity-50"
    >
      <Copy className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {busy ? 'Saving…' : 'Save as template'}
    </button>
  )
}
