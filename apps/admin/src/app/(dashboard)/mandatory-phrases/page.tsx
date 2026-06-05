// Admin — Mandatory label phrases catalog (required disclaimers, warnings,
// allergen statements, etc.). v2 surface: cream hero + KPIs + URL-driven chip
// filters + table + row actions.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { Button, KpiWidget } from '@ilaunchify/ui'
import { Plus, ScrollText, CheckCircle2, AlertTriangle, FileText, ShieldAlert } from 'lucide-react'
import { PhraseRowActions } from './PhraseRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mandatory phrases — Admin' }

const CATEGORIES = ['ALLERGEN', 'DISCLAIMER', 'WARNING', 'IDENTITY', 'DIRECTIONS', 'OTHER'] as const
const LABELING_TYPES = ['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'PET_PRODUCT', 'BEVERAGE', 'COSMETIC'] as const

const CAT_LABEL: Record<string, string> = {
  ALLERGEN: 'Allergen',
  DISCLAIMER: 'Disclaimer',
  WARNING: 'Warning',
  IDENTITY: 'Identity',
  DIRECTIONS: 'Directions',
  OTHER: 'Other',
}
const LT_LABEL: Record<string, string> = {
  FOOD: 'Food',
  DIETARY_SUPPLEMENT: 'Supplement',
  OTC: 'OTC',
  PET_PRODUCT: 'Pet',
  BEVERAGE: 'Beverage',
  COSMETIC: 'Cosmetic',
}
const CAT_BADGE: Record<string, string> = {
  ALLERGEN: 'bg-orange-100 text-orange-800',
  DISCLAIMER: 'bg-sky-100 text-sky-800',
  WARNING: 'bg-rose-100 text-rose-800',
  IDENTITY: 'bg-violet-100 text-violet-800',
  DIRECTIONS: 'bg-emerald-100 text-emerald-800',
  OTHER: 'bg-zinc-100 text-zinc-600',
}

function chipHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `/mandatory-phrases?${s}` : '/mandatory-phrases'
}

export default async function MandatoryPhrasesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; labelingType?: string }>
}) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const category = CATEGORIES.includes(sp.category as never) ? sp.category : undefined
  const labelingType = LABELING_TYPES.includes(sp.labelingType as never) ? sp.labelingType : undefined

  const all = await prisma.mandatoryPhrase.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const rows = all.filter(
    (p) =>
      (!category || p.category === category) &&
      (!labelingType || p.labelingTypes.includes(labelingType)),
  )

  const total = all.length
  const active = all.filter((p) => p.isActive).length
  const warnings = all.filter((p) => p.category === 'WARNING').length
  const disclaimers = all.filter((p) => p.category === 'DISCLAIMER').length
  const allergens = all.filter((p) => p.category === 'ALLERGEN').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl bg-[#F3EFE8] px-6 py-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Compliance · Label phrases
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Mandatory phrases</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Required label statements — allergen "Contains:", DSHEA disclaimer, iron warning, and
            more — that the compliance scanner + label renderer reference per labeling type.
          </p>
        </div>
        <Button asChild className="bg-zinc-900 hover:bg-black">
          <Link href="/mandatory-phrases/new">
            <Plus className="mr-1.5 h-4 w-4" /> Add phrase
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiWidget label="Total" value={total} icon={ScrollText} tone="ink" />
        <KpiWidget label="Active" value={active} icon={CheckCircle2} tone="success" />
        <KpiWidget label="Warnings" value={warnings} icon={AlertTriangle} tone="danger" />
        <KpiWidget label="Disclaimers" value={disclaimers} icon={FileText} tone="info" />
        <KpiWidget label="Allergen" value={allergens} icon={ShieldAlert} tone="warning" />
      </div>

      {/* Filter chips */}
      <div className="space-y-2">
        <ChipRow
          label="Category"
          options={[{ v: undefined, t: 'All' }, ...CATEGORIES.map((c) => ({ v: c, t: CAT_LABEL[c]! }))]}
          active={category}
          build={(v) => chipHref({ category: v, labelingType })}
        />
        <ChipRow
          label="Labeling type"
          options={[{ v: undefined, t: 'All' }, ...LABELING_TYPES.map((t) => ({ v: t, t: LT_LABEL[t]! }))]}
          active={labelingType}
          build={(v) => chipHref({ category, labelingType: v })}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-2.5 font-semibold">Phrase</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 font-semibold">Labeling types</th>
              <th className="px-4 py-2.5 font-semibold">CFR</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">
                  No phrases match this filter.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/mandatory-phrases/${p.id}`} className="font-medium text-zinc-900 hover:text-pink-700">
                      {p.title}
                    </Link>
                    <p className="mt-0.5 max-w-md truncate text-[12px] text-zinc-500">{p.body}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CAT_BADGE[p.category] ?? ''}`}>
                      {CAT_LABEL[p.category] ?? p.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-zinc-600">
                    {p.labelingTypes.map((t) => LT_LABEL[t] ?? t).join(', ')}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500">{p.cfrCitation ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                        (p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-500')
                      }
                    >
                      {p.isActive ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <PhraseRowActions id={p.id} title={p.title} isActive={p.isActive} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChipRow({
  label,
  options,
  active,
  build,
}: {
  label: string
  options: { v: string | undefined; t: string }[]
  active: string | undefined
  build: (v: string | undefined) => string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      {options.map((o) => {
        const isActive = (o.v ?? undefined) === (active ?? undefined)
        return (
          <Link
            key={o.t}
            href={build(o.v)}
            className={
              'rounded-full px-2.5 py-1 text-[12px] font-medium ' +
              (isActive ? 'bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:bg-zinc-100')
            }
          >
            {o.t}
          </Link>
        )
      })}
    </div>
  )
}
