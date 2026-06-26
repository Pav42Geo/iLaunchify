// Admin — Mandatory label phrases catalog (required disclaimers, warnings,
// allergen statements, etc.). v2 surface: cream hero + KPIs + URL-driven chip
// filters + table + row actions.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { Button, KpiWidget } from '@ilaunchify/ui'
import { Plus, ScrollText, CheckCircle2, AlertTriangle, FileText, ShieldAlert } from 'lucide-react'
import { PhraseRowActions } from './PhraseRowActions'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Phrase library — Admin' }

const CATEGORIES = [
  'ALLERGEN',
  'DISCLAIMER',
  'WARNING',
  'IDENTITY',
  'DIRECTIONS',
  'CLAIM',
  'SUSTAINABILITY',
  'MARKETING',
  'OTHER',
] as const
const LABELING_TYPES = ['FOOD', 'DIETARY_SUPPLEMENT', 'OTC', 'PET_PRODUCT', 'BEVERAGE', 'COSMETIC'] as const
const REQUIREMENTS = ['MANDATORY', 'RECOMMENDED'] as const

const CAT_LABEL: Record<string, string> = {
  ALLERGEN: 'Allergen',
  DISCLAIMER: 'Disclaimer',
  WARNING: 'Warning',
  IDENTITY: 'Identity',
  DIRECTIONS: 'Directions',
  CLAIM: 'Claim',
  SUSTAINABILITY: 'Sustainability',
  MARKETING: 'Marketing',
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
  ALLERGEN: 'bg-warning-100 text-warning-800',
  DISCLAIMER: 'bg-info-100 text-info-800',
  WARNING: 'bg-danger-100 text-danger-800',
  IDENTITY: 'bg-info-100 text-info-800',
  DIRECTIONS: 'bg-success-100 text-success-800',
  CLAIM: 'bg-info-100 text-info-800',
  SUSTAINABILITY: 'bg-info-100 text-info-800',
  MARKETING: 'bg-pink-100 text-pink-800',
  OTHER: 'bg-ink-100 text-ink-600',
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
  searchParams: Promise<{ category?: string; labelingType?: string; requirement?: string }>
}) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const category = CATEGORIES.includes(sp.category as never) ? sp.category : undefined
  const labelingType = LABELING_TYPES.includes(sp.labelingType as never) ? sp.labelingType : undefined
  const requirement = REQUIREMENTS.includes(sp.requirement as never) ? sp.requirement : undefined

  const all = await prisma.mandatoryPhrase.findMany({
    orderBy: [{ requirement: 'asc' }, { category: 'asc' }, { displayOrder: 'asc' }],
  })

  const rows = all.filter(
    (p) =>
      (!category || p.category === category) &&
      (!labelingType || p.labelingTypes.includes(labelingType)) &&
      (!requirement || p.requirement === requirement),
  )

  const total = all.length
  const mandatory = all.filter((p) => p.requirement === 'MANDATORY').length
  const recommended = all.filter((p) => p.requirement === 'RECOMMENDED').length
  const warnings = all.filter((p) => p.category === 'WARNING').length
  const allergens = all.filter((p) => p.category === 'ALLERGEN').length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Compliance · Phrase library"
        title="Phrase library"
        description={
          <>
            Mandatory + recommended label phrases — allergen &quot;Contains:&quot;, DSHEA disclaimer, warnings,
            claims, sustainability — that the Studio phrase drawer + compliance scanner reference per
            labeling type.
          </>
        }
        actions={
          <Button asChild className="bg-ink-900 hover:bg-black">
            <Link href="/mandatory-phrases/new">
              <Plus className="mr-1.5 h-4 w-4" /> Add phrase
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiWidget label="Total" value={total} icon={ScrollText} tone="ink" />
        <KpiWidget label="Mandatory" value={mandatory} icon={ShieldAlert} tone="danger" />
        <KpiWidget label="Recommended" value={recommended} icon={CheckCircle2} tone="success" />
        <KpiWidget label="Warnings" value={warnings} icon={AlertTriangle} tone="warning" />
        <KpiWidget label="Allergen" value={allergens} icon={FileText} tone="info" />
      </div>

      {/* Filter chips */}
      <div className="space-y-2">
        <ChipRow
          label="Requirement"
          options={[
            { v: undefined, t: 'All' },
            { v: 'MANDATORY', t: 'Mandatory' },
            { v: 'RECOMMENDED', t: 'Recommended' },
          ]}
          active={requirement}
          build={(v) => chipHref({ category, labelingType, requirement: v })}
        />
        <ChipRow
          label="Category"
          options={[{ v: undefined, t: 'All' }, ...CATEGORIES.map((c) => ({ v: c, t: CAT_LABEL[c]! }))]}
          active={category}
          build={(v) => chipHref({ category: v, labelingType, requirement })}
        />
        <ChipRow
          label="Labeling type"
          options={[{ v: undefined, t: 'All' }, ...LABELING_TYPES.map((t) => ({ v: t, t: LT_LABEL[t]! }))]}
          active={labelingType}
          build={(v) => chipHref({ category, labelingType: v, requirement })}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5 font-semibold">Phrase</th>
              <th className="px-4 py-2.5 font-semibold">Requirement</th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">
                  No phrases match this filter.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/mandatory-phrases/${p.id}`} className="font-medium text-ink-900 hover:text-pink-700">
                      {p.title}
                    </Link>
                    <p className="mt-0.5 max-w-md truncate text-[12px] text-ink-500">{p.body}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                        (p.requirement === 'MANDATORY'
                          ? 'bg-danger-100 text-danger-800'
                          : 'bg-info-100 text-info-800')
                      }
                    >
                      {p.requirement === 'MANDATORY' ? 'Mandatory' : 'Recommended'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CAT_BADGE[p.category] ?? ''}`}>
                      {CAT_LABEL[p.category] ?? p.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-ink-600">
                    {p.labelingTypes.map((t) => LT_LABEL[t] ?? t).join(', ')}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink-500">{p.cfrCitation ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                        (p.isActive ? 'bg-success-100 text-success-800' : 'bg-ink-100 text-ink-500')
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
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      {options.map((o) => {
        const isActive = (o.v ?? undefined) === (active ?? undefined)
        return (
          <Link
            key={o.t}
            href={build(o.v)}
            className={
              'rounded-full px-2.5 py-1 text-[12px] font-medium ' +
              (isActive ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-600 hover:bg-ink-100')
            }
          >
            {o.t}
          </Link>
        )
      })}
    </div>
  )
}
