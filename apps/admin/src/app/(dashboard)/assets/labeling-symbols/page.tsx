// Admin — Labeling Symbol catalog (C7 asset library). Locked v2 surface.
//
// Query params: ?family=… ?status=ACTIVE|DEPRECATED

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { ScrollText, CheckCircle2, AlertOctagon, Layers, Plus, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LabelingSymbolFamily, AssetCatalogStatus } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Labeling symbols — Admin' }

const FAMILIES: LabelingSymbolFamily[] = ['ATTRIBUTION', 'STORAGE', 'ALLERGEN', 'DISCLOSURE', 'WARNING', 'OTHER']

function humanFamily(f: LabelingSymbolFamily): string {
  return f.toLowerCase().split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}
function isFamily(s: string | undefined): s is LabelingSymbolFamily {
  return !!s && (FAMILIES as string[]).includes(s)
}
function isStatus(s: string | undefined): s is AssetCatalogStatus {
  return s === 'ACTIVE' || s === 'DEPRECATED'
}

interface PageProps {
  searchParams: Promise<{ family?: string; status?: string }>
}

export default async function LabelingSymbolsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const family = isFamily(sp.family) ? sp.family : undefined
  const status = isStatus(sp.status) ? sp.status : undefined

  const where: Record<string, unknown> = {}
  if (family) where.family = family
  if (status) where.status = status

  const [rows, familyCounts, statusCounts, totalVariants] = await Promise.all([
    prisma.labelingSymbol.findMany({
      where: where as never,
      include: { _count: { select: { variants: true } } },
      orderBy: [{ family: 'asc' }, { name: 'asc' }],
    }),
    prisma.labelingSymbol.groupBy({ by: ['family'], _count: { _all: true } }),
    prisma.labelingSymbol.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.labelingSymbolVariant.count(),
  ])

  const familyCountMap = new Map(familyCounts.map((c) => [c.family as LabelingSymbolFamily, c._count._all]))
  const statusCountMap = new Map(statusCounts.map((c) => [c.status as AssetCatalogStatus, c._count._all]))
  const active = statusCountMap.get('ACTIVE') ?? 0
  const deprecated = statusCountMap.get('DEPRECATED') ?? 0
  const total = active + deprecated

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-ink-200 bg-cream px-6 py-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
              Asset Management · Labeling symbols
            </p>
            <h1 className="mt-1 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
              Labeling symbols
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
              Attribution, storage, allergen, disclosure + warning marks, with approved artwork
              variants + applicability rules.
            </p>
          </div>
          <Link
            href="/assets/labeling-symbols/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-[13px] font-semibold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-3.5 w-3.5" /> Add symbol
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Total symbols" value={total} icon={ScrollText} active />
          <Kpi label="Active" value={active} icon={CheckCircle2} tone="emerald" />
          <Kpi label="Deprecated" value={deprecated} icon={AlertOctagon} tone="rose" />
          <Kpi label="Families" value={familyCountMap.size} icon={Layers} tone="sky" />
          <Kpi label="Artwork variants" value={totalVariants} icon={Tag} tone="violet" />
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200 bg-white p-4 space-y-3">
        <ChipRow label="Family">
          <Chip href="/assets/labeling-symbols" active={!family} label="All" count={total} />
          {FAMILIES.map((f) => (
            <Chip
              key={f}
              href={`/assets/labeling-symbols?family=${f}`}
              active={family === f}
              label={humanFamily(f)}
              count={familyCountMap.get(f) ?? 0}
            />
          ))}
        </ChipRow>
        <ChipRow label="Status">
          <Chip href={family ? `/assets/labeling-symbols?family=${family}` : '/assets/labeling-symbols'} active={!status} label="All" count={total} />
          {(['ACTIVE', 'DEPRECATED'] as AssetCatalogStatus[]).map((s) => (
            <Chip
              key={s}
              href={`/assets/labeling-symbols?${family ? `family=${family}&` : ''}status=${s}`}
              active={status === s}
              label={s === 'ACTIVE' ? 'Active' : 'Deprecated'}
              count={statusCountMap.get(s) ?? 0}
            />
          ))}
        </ChipRow>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center text-[13px] text-ink-500">
          No labeling symbols{family || status ? ' match these filters' : ' yet'}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Name</th>
                <th className="px-3 py-2.5 text-left font-semibold">Family</th>
                <th className="px-3 py-2.5 text-left font-semibold">Requirement</th>
                <th className="px-3 py-2.5 text-right font-semibold">Variants</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-pink-50/20">
                  <td className="px-3 py-3">
                    <Link href={`/assets/labeling-symbols/${r.id}`} className="font-semibold text-ink-900 hover:text-pink-700">
                      {r.name}
                    </Link>
                    <code className="ml-2 rounded border border-ink-200 bg-zinc-50 px-1.5 py-[1px] font-mono text-[10px] text-ink-500">
                      {r.slug}
                    </code>
                  </td>
                  <td className="px-3 py-3 text-ink-700">{humanFamily(r.family as LabelingSymbolFamily)}</td>
                  <td className="px-3 py-3 text-ink-700">{r.requirement.charAt(0) + r.requirement.slice(1).toLowerCase()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r._count.variants}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                        r.status === 'ACTIVE'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-zinc-200 bg-zinc-50 text-ink-600',
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', r.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-zinc-400')} />
                      {r.status === 'ACTIVE' ? 'Active' : 'Deprecated'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/assets/labeling-symbols/${r.id}`} className="text-[12px] font-medium text-emerald-700 hover:underline">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-700">{label}</span>
      {children}
    </div>
  )
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
        active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      {label}
      <span className={cn('text-[10.5px] tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>{count}</span>
    </Link>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  active,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: 'emerald' | 'rose' | 'sky' | 'violet'
  active?: boolean
}) {
  const iconTone: Record<'emerald' | 'rose' | 'sky' | 'violet', string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
  }
  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white px-4 py-3.5 ring-1 ring-transparent', active && 'ring-pink-300/40')}>
      <div className="flex items-center gap-3">
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl', tone ? iconTone[tone] : 'bg-pink-100 text-pink-700')}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">{label}</p>
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">{value}</p>
        </div>
      </div>
    </div>
  )
}
