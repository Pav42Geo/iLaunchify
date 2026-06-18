'use client'

// Marketplace detail-page marketing-copy editor (admin product review).
// Authors ProductTemplate.longDescription + marketingDetail (the partial
// TemplateDetail the marketing detail page merges over the per-slug fixture).
//
// V1.1 scope: the high-value TEXT fields plus the structured SPEC tables that
// have no canonical DB source — size chart, packing specs, and material
// properties. These are pure marketing/spec copy authored per template.
//
// Still fixture-backed (the bigger recipe-derived follow-up): flavors,
// ingredients, ingredientAddOns, and the nutrition panel — those should come
// from the template's real Recipe + the nutrition engine, not hand-authored
// JSON. Their existing marketingDetail values (if any) are preserved on save.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
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

/* -------- row-table types -------- */

// Type aliases (not interfaces) so they satisfy the Record<string,string>
// constraint on RowsEditor — interfaces have no implicit index signature.
type PropertyRow = { label: string; value: string }
type SizeRow = { size: string; servings: string; bottle: string; capsules: string }
type PackRow = {
  size: string; box: string; boxIn: string; volumeCm3: string; volumeIn3: string; weightG: string; weightLb: string
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
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
  const [customizationDescription, setCustomizationDescription] = useState(str(md.customizationDescription))
  const [designReminder, setDesignReminder] = useState(str(md.designReminder))
  const [pictureRequest, setPictureRequest] = useState(str(md.pictureRequest))

  const [properties, setProperties] = useState<PropertyRow[]>(
    asRecordArray(md.properties).map((r) => ({
      label: str(r.label),
      value: typeof r.value === 'number' ? String(r.value) : str(r.value),
    })),
  )
  const [sizeChart, setSizeChart] = useState<SizeRow[]>(
    asRecordArray(md.sizeChart).map((r) => ({
      size: str(r.size), servings: str(r.servings), bottle: str(r.bottle), capsules: str(r.capsules),
    })),
  )
  const [packingSpecs, setPackingSpecs] = useState<PackRow[]>(
    asRecordArray(md.packingSpecs).map((r) => ({
      size: str(r.size), box: str(r.box), boxIn: str(r.boxIn), volumeCm3: str(r.volumeCm3),
      volumeIn3: str(r.volumeIn3), weightG: str(r.weightG), weightLb: str(r.weightLb),
    })),
  )

  const [status, setStatus] = useState<string | null>(null)
  const dirty = () => setStatus(null)

  function save() {
    const performanceBullets = bullets.split('\n').map((s) => s.trim()).filter(Boolean)

    const cleanProps = properties
      .filter((p) => p.label.trim())
      .map((p) => ({ label: p.label.trim(), value: clampPct(p.value) }))
    const cleanSize = sizeChart.filter((s) => s.size.trim())
    const cleanPack = packingSpecs.filter((s) => s.size.trim())

    // Start from the existing JSON so fields we don't edit here (flavors,
    // ingredients, ingredientAddOns, nutrition) survive untouched. Empty
    // optional fields → undefined so the detail page falls back to the fixture.
    const marketingDetail: Record<string, unknown> = {
      ...md,
      format: format.trim() || undefined,
      productionMethod: productionMethod.trim() || undefined,
      netWeight: netWeight.trim() || undefined,
      performanceBullets: performanceBullets.length ? performanceBullets : undefined,
      customizationDescription: customizationDescription.trim() || undefined,
      designReminder: designReminder.trim() || undefined,
      pictureRequest: pictureRequest.trim() || undefined,
      properties: cleanProps.length ? cleanProps : undefined,
      sizeChart: cleanSize.length ? cleanSize : undefined,
      packingSpecs: cleanPack.length ? cleanPack : undefined,
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

      <div className="space-y-5 p-5">
        <Field label="Long description" hint="The detail-page “About” paragraph.">
          <textarea rows={3} className={INPUT} value={longDescription}
            onChange={(e) => { setLongDescription(e.target.value); dirty() }} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Format" hint="e.g. “Powder · 30 servings”">
            <input className={INPUT} value={format} onChange={(e) => { setFormat(e.target.value); dirty() }} />
          </Field>
          <Field label="Production method" hint="e.g. “Spray-dried”">
            <input className={INPUT} value={productionMethod} onChange={(e) => { setProductionMethod(e.target.value); dirty() }} />
          </Field>
          <Field label="Net weight" hint="e.g. “240 g”">
            <input className={INPUT} value={netWeight} onChange={(e) => { setNetWeight(e.target.value); dirty() }} />
          </Field>
        </div>

        <Field label="Performance bullets" hint="One per line — the marketing highlights.">
          <textarea rows={5} className={INPUT} value={bullets}
            onChange={(e) => { setBullets(e.target.value); dirty() }} />
        </Field>

        <Field label="Customization description" hint="How the creator can customize this template.">
          <textarea rows={2} className={INPUT} value={customizationDescription}
            onChange={(e) => { setCustomizationDescription(e.target.value); dirty() }} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Design reminder" hint="Fine-print disclaimer under the artwork tools.">
            <textarea rows={2} className={INPUT} value={designReminder}
              onChange={(e) => { setDesignReminder(e.target.value); dirty() }} />
          </Field>
          <Field label="Picture request" hint="e.g. “2400 px × 3000 px @ 300 DPI · CMYK”">
            <input className={INPUT} value={pictureRequest}
              onChange={(e) => { setPictureRequest(e.target.value); dirty() }} />
          </Field>
        </div>

        <RowsEditor<PropertyRow>
          title="Material properties"
          hint="Bars under “Material”. Value is 0–100."
          columns={[
            { key: 'label', label: 'Property', width: 'flex-1' },
            { key: 'value', label: '0–100', width: 'w-24', numeric: true },
          ]}
          rows={properties}
          empty={{ label: '', value: '' }}
          onChange={(r) => { setProperties(r); dirty() }}
        />

        <RowsEditor<SizeRow>
          title="Size chart"
          hint="Rows in the “Sizes” table."
          columns={[
            { key: 'size', label: 'Size', width: 'w-24' },
            { key: 'servings', label: 'Servings', width: 'flex-1' },
            { key: 'bottle', label: 'Dimensions', width: 'flex-1' },
            { key: 'capsules', label: 'Capsules', width: 'w-24' },
          ]}
          rows={sizeChart}
          empty={{ size: '', servings: '', bottle: '', capsules: '' }}
          onChange={(r) => { setSizeChart(r); dirty() }}
        />

        <RowsEditor<PackRow>
          title="Packing specs"
          hint="Carton dimensions / volume / weight per size."
          columns={[
            { key: 'size', label: 'Size', width: 'w-20' },
            { key: 'box', label: 'Box (cm)', width: 'flex-1' },
            { key: 'boxIn', label: 'Box (in)', width: 'flex-1' },
            { key: 'volumeCm3', label: 'cm³', width: 'w-20' },
            { key: 'volumeIn3', label: 'in³', width: 'w-20' },
            { key: 'weightG', label: 'g', width: 'w-16' },
            { key: 'weightLb', label: 'lb', width: 'w-16' },
          ]}
          rows={packingSpecs}
          empty={{ size: '', box: '', boxIn: '', volumeCm3: '', volumeIn3: '', weightG: '', weightLb: '' }}
          onChange={(r) => { setPackingSpecs(r); dirty() }}
        />

        <div className="flex items-center justify-end gap-3 border-t border-ink-100 pt-4">
          {status && <span className="text-[12px] text-ink-500">{status}</span>}
          <button type="button" onClick={save} disabled={pending}
            className="rounded-full bg-ink-900 px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
            {pending ? 'Saving…' : 'Save copy'}
          </button>
        </div>
      </div>
    </section>
  )
}

function clampPct(v: string): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/* -------- generic add/remove row table -------- */

interface ColumnDef<T> {
  key: keyof T & string
  label: string
  width?: string
  numeric?: boolean
}

function RowsEditor<T extends Record<string, string>>({
  title,
  hint,
  columns,
  rows,
  empty,
  onChange,
}: {
  title: string
  hint?: string
  columns: ColumnDef<T>[]
  rows: T[]
  empty: T
  onChange: (rows: T[]) => void
}) {
  function update(i: number, key: keyof T & string, value: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }
  function add() {
    onChange([...rows, { ...empty }])
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-ink-800">{title}</span>
        {hint && <span className="text-[11.5px] text-ink-500">{hint}</span>}
      </div>
      {rows.length === 0 && (
        <p className="mb-2 text-[12px] italic text-ink-400">
          None — falls back to the template fixture on the detail page.
        </p>
      )}
      {rows.length > 0 && (
        <div className="mb-2 hidden gap-2 px-1 sm:flex">
          {columns.map((c) => (
            <span key={c.key} className={`${c.width ?? 'flex-1'} text-[10.5px] font-semibold uppercase tracking-wide text-ink-400`}>
              {c.label}
            </span>
          ))}
          <span className="w-8" />
        </div>
      )}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {columns.map((c) => (
              <input
                key={c.key}
                className={`${c.width ?? 'flex-1'} rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12.5px] text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500`}
                value={row[c.key]}
                inputMode={c.numeric ? 'numeric' : undefined}
                placeholder={c.label}
                onChange={(e) => update(i, c.key, e.target.value)}
              />
            ))}
            <button type="button" onClick={() => remove(i)} aria-label="Remove row"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 transition-colors hover:border-pink-300 hover:text-pink-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[12px] font-semibold text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50">
        <Plus className="h-3.5 w-3.5" /> Add row
      </button>
    </div>
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
