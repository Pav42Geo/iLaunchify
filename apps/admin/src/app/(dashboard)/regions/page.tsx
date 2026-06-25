// Admin Regions list — read-only V1 (#154).
//
// Regions are geography (not regulation — that's Market). One Region row per
// COUNTRY/SUBNATIONAL_GROUP/STATE_PROVINCE node; parent-child indentation
// shows the hierarchy. Like Markets, Region rows are seed-driven; the admin
// surface is read-only in V1.
//
// Columns:
//   • Code (chip) + name
//   • Kind pill (COUNTRY / SUBNATIONAL_GROUP / STATE_PROVINCE / METRO)
//   • Parent region (when applicable)
//   • Partners with this as primaryRegion (cheap COUNT)
//   • Brands operating here (cheap COUNT)
//
// Tree rendering: flat table + visual depth marker on indented rows.

import { MapPin, Globe, Users, Building2 } from 'lucide-react'
import { prisma } from '@ilaunchify/db'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Regions — Admin' }

const FALLBACK_KIND_TONE = { bg: 'bg-ink-100 text-ink-700', label: 'Region' } as const

const KIND_TONE: Record<string, { bg: string; label: string }> = {
  COUNTRY: { bg: 'bg-pink-100 text-pink-700', label: 'Country' },
  SUBNATIONAL_GROUP: { bg: 'bg-blue-100 text-blue-700', label: 'Region group' },
  STATE_PROVINCE: { bg: 'bg-emerald-100 text-emerald-700', label: 'State / Province' },
  METRO: { bg: 'bg-amber-100 text-amber-700', label: 'Metro' },
}

export default async function RegionsPage() {
  const regions = await prisma.region.findMany({
    orderBy: [{ marketId: 'asc' }, { kind: 'asc' }, { name: 'asc' }],
    include: {
      market: { select: { code: true, name: true } },
      parent: { select: { code: true, name: true } },
      _count: {
        select: {
          partnersAtRegion: true,
          brandsOperating: true,
          children: true,
        },
      },
    },
  })

  const countries = regions.filter((r) => r.kind === 'COUNTRY').length
  const states = regions.filter((r) => r.kind === 'STATE_PROVINCE').length

  // Group by market for visual section headers — keeps US vs CA distinct.
  const byMarket = new Map<
    string,
    { marketCode: string; marketName: string; rows: typeof regions }
  >()
  for (const r of regions) {
    const key = r.marketId
    if (!byMarket.has(key)) {
      byMarket.set(key, {
        marketCode: r.market.code,
        marketName: r.market.name,
        rows: [],
      })
    }
    byMarket.get(key)!.rows.push(r)
  }

  return (
    <div className="space-y-6">
      <Header
        title="Regions"
        subtitle="Geographic units used for partner proximity + brand operating-region filters. Seeded; rerun pnpm seed to refresh."
        chips={[
          { icon: Globe, label: `${regions.length} total` },
          { icon: MapPin, label: `${countries} countries` },
          { icon: MapPin, label: `${states} states/provinces` },
        ]}
      />

      {regions.length === 0 ? <EmptyState /> : null}

      {[...byMarket.values()].map((group) => (
        <section
          key={group.marketCode}
          className="overflow-hidden rounded-2xl border border-ink-200 bg-white"
        >
          <header className="flex items-center justify-between gap-3 border-b border-ink-100 bg-[#FBFAF7] px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-7 items-center justify-center rounded-md border border-ink-200 bg-white text-[10px] font-bold uppercase tracking-wider text-ink-700">
                {group.marketCode}
              </span>
              <h2 className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink-900">
                {group.marketName}
              </h2>
            </div>
            <span className="text-[11.5px] tabular-nums text-ink-500">
              {group.rows.length} regions
            </span>
          </header>
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50/60 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <Th>Region</Th>
                <Th>Kind</Th>
                <Th>Parent</Th>
                <Th className="text-right">Children</Th>
                <Th className="text-right">Partners</Th>
                <Th className="text-right">Brands</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {group.rows.map((r) => {
                const kindCfg = KIND_TONE[r.kind] ?? FALLBACK_KIND_TONE
                const depth = depthOf(r.kind)
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 align-top">
                      <div
                        className="flex items-start gap-2.5"
                        style={{ paddingLeft: depth * 14 }}
                      >
                        {depth > 0 && (
                          <span
                            aria-hidden="true"
                            className="mt-2 inline-block h-px w-3 shrink-0 bg-ink-300"
                          />
                        )}
                        <span className="inline-flex h-6 items-center rounded-md border border-ink-200 bg-ink-50 px-1.5 text-[10px] font-bold uppercase tabular-nums text-ink-700">
                          {r.code}
                        </span>
                        <p className="font-semibold text-ink-900">{r.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={
                          'inline-flex rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider ' +
                          kindCfg.bg
                        }
                      >
                        {kindCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-ink-600">
                      {r.parent ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="rounded border border-ink-200 bg-white px-1 py-[1px] text-[10px] font-semibold tabular-nums text-ink-700">
                            {r.parent.code}
                          </span>
                          <span>{r.parent.name}</span>
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <NumCell n={r._count.children} />
                    <NumCell n={r._count.partnersAtRegion} icon={Users} />
                    <NumCell n={r._count.brandsOperating} icon={Building2} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

// =============================================================================
// Local helpers
// =============================================================================

function depthOf(kind: string): number {
  switch (kind) {
    case 'COUNTRY':
      return 0
    case 'SUBNATIONAL_GROUP':
      return 1
    case 'STATE_PROVINCE':
      return 2
    case 'METRO':
      return 3
    default:
      return 0
  }
}

function Header({
  title,
  subtitle,
  chips,
}: {
  title: string
  subtitle: string
  chips: Array<{ icon: typeof Globe; label: string }>
}) {
  return (
    <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-[var(--bg-hero)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-[0.06em] text-ink-700">
            Catalog
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-ink-900">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-[3px] text-[11px] font-medium text-ink-700"
            >
              <c.icon className="h-3 w-3" aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={
        'px-4 py-2.5 text-left font-semibold ' + (className ?? '')
      }
    >
      {children}
    </th>
  )
}

function NumCell({
  n,
  icon: Icon,
}: {
  n: number
  icon?: typeof Globe
}) {
  return (
    <td className="px-4 py-3 text-right align-top tabular-nums">
      <span className="inline-flex items-center gap-1 text-ink-700">
        {Icon && <Icon className="h-3 w-3 text-ink-400" aria-hidden="true" />}
        <span
          className={n > 0 ? 'font-semibold text-ink-900' : 'text-ink-400'}
        >
          {n}
        </span>
      </span>
    </td>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-zinc-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <MapPin className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        No regions seeded
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        Run <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11.5px]">
          pnpm seed
        </code>{' '}
        to populate the seeded country / state / metro rows.
      </p>
    </div>
  )
}
