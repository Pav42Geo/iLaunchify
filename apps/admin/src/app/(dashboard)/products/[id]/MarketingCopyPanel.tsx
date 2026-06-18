'use client'

// Marketplace detail-page marketing-copy editor (admin product review).
// Authors ProductTemplate.longDescription + marketingDetail (the partial
// TemplateDetail the marketing detail page merges over the per-slug fixture).
// V1 edits the high-value text fields; the nested sizeChart / packingSpecs /
// properties stay fixture-backed until a richer editor lands (their existing
// marketingDetail values are preserved on save).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { adminSetMarketingDetail } from '../actions'

export interface MarketingCopyInitial {
  longDescription: string | null
  marketingDetail: Record<string, unknown> | null
}

const INPUT =
  'w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function MarketingCopyPanel({
  productTemplateId,
  initial,
}: {
  productTemplateId: string
  initial: MarketingCopyInitial
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const md = (initial.marketingDetail ?? {}) as Record<string, unknown>

  const [longDescription, setLongDescription] = useState(initial.longDescription ?? '')
  const [format, setFormat] = useState(str(md.format))
  const [productionMethod, setProductionMethod] = useState(str(md.productionMethod))
  const [netWeight, setNetWeight] = useState(str(md.netWeight))
  const [bullets, setBullets] = useState(
    Array.isArray(md.performanceBullets) ? (md.performanceBullets as string[]).join('\n') : '',
  )
  const [status, setStatus] = useState<string | null>(null)

  function save() {
    const performanceBullets = bullets
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    // Preserve any nested fields we don't edit here (sizeChart, packingSpecs, …).
    const marketingDetail: Record<string, unknown> = {
      ...md,
      format: format.trim() || undefined,
      productionMethod: productionMethod.trim() || undefined,
      netWeight: netWeight.trim() || undefined,
      performanceBullets: performanceBullets.length ? performanceBullets : undefined,
    }
    start(async () => {
      const res = await adminSetMarketingDetail({
        productTemplateId,
        longDescription: longDescription.trim() || null,
        marketingDetail,
      })
      if (res.ok) {
        setStatus('Saved')
        toast.success('Marketing copy saved')
        router.refresh()
      } else {
        setStatus(res.error)
        toast.error(res.error)
      }
    })
  }

  return (
    <section className="rounded-3xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 rounded-t-3xl border-b border-ink-200 bg-cream px-5 py-3">
        <Megaphone className="h-4 w-4 text-ink-600" />
        <h3 className="font-display text-[15px] font-semibold text-ink-900">Marketplace copy</h3>
        <span className="ml-auto text-[11.5px] text-ink-500">Shown on the public detail page</span>
      </div>

      <div className="space-y-4 p-5">
        <Field label="Long description" hint="The detail-page “About” paragraph.">
          <textarea
            rows={3}
            className={INPUT}
            value={longDescription}
            onChange={(e) => { setLongDescription(e.target.value); setStatus(null) }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Format" hint="e.g. “Powder · 30 servings”">
            <input className={INPUT} value={format} onChange={(e) => { setFormat(e.target.value); setStatus(null) }} />
          </Field>
          <Field label="Production method" hint="e.g. “Spray-dried”">
            <input className={INPUT} value={productionMethod} onChange={(e) => { setProductionMethod(e.target.value); setStatus(null) }} />
          </Field>
          <Field label="Net weight" hint="e.g. “240 g”">
            <input className={INPUT} value={netWeight} onChange={(e) => { setNetWeight(e.target.value); setStatus(null) }} />
          </Field>
        </div>

        <Field label="Performance bullets" hint="One per line — the marketing highlights.">
          <textarea
            rows={5}
            className={INPUT}
            value={bullets}
            onChange={(e) => { setBullets(e.target.value); setStatus(null) }}
          />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
          {status && <span className="text-[12px] text-ink-500">{status}</span>}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            {pending ? 'Saving…' : 'Save copy'}
          </button>
        </div>
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-ink-800">{label}</span>
      {hint && <span className="mb-1.5 block text-[11.5px] text-ink-500">{hint}</span>}
      {children}
    </label>
  )
}
