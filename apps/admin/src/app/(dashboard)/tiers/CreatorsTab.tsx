// REBUILD R15.c — Creators tab in admin Tiers module.
//
// Read-only list in R15.c. The per-row "Edit" link points at a drawer
// route that R15.d implements (server action + audit-logged write).

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Input } from '@ilaunchify/ui'
import { Search, AlertTriangle } from 'lucide-react'
import { CREATOR_TIER_STYLE, tierPillStyle } from './tier-style'

interface Props {
  q: string
  tier: string
}

const TIER_FILTERS = ['', 'MAKER', 'BUILDER', 'AGENCY'] as const
const TIER_LABEL: Record<string, string> = {
  '': 'All tiers',
  MAKER: 'Maker',
  BUILDER: 'Builder',
  AGENCY: 'Agency',
}

export async function CreatorsTab({ q, tier }: Props) {
  const where: Parameters<typeof prisma.creatorProfile.findMany>[0] = {
    where: {
      ...(q.trim()
        ? {
            OR: [
              { displayName: { contains: q.trim(), mode: 'insensitive' } },
              { handle: { contains: q.trim(), mode: 'insensitive' } },
              { user: { email: { contains: q.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(tier && ['MAKER', 'BUILDER', 'AGENCY'].includes(tier)
        ? { subscriptionTier: tier as 'MAKER' | 'BUILDER' | 'AGENCY' }
        : {}),
    },
    orderBy: [{ tierChangedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { brands: true } },
    },
  } as Parameters<typeof prisma.creatorProfile.findMany>[0]

  const rows = await prisma.creatorProfile.findMany(where as never)

  return (
    <section className="space-y-3">
      <FilterBar q={q} activeTier={tier} />
      <CreatorsTable rows={rows as never[]} />
      {rows.length === 0 && <EmptyHint />}
    </section>
  )
}

function FilterBar({ q, activeTier }: { q: string; activeTier: string }) {
  return (
    <form className="flex flex-wrap items-center gap-3" action="/tiers" method="get">
      <input type="hidden" name="tab" value="creators" />
      <div className="relative flex-1 min-w-[240px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name, handle, or email…"
          className="pl-9 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIER_FILTERS.map((t) => {
          const isActive = activeTier === t
          return (
            <button
              key={t || 'all'}
              type="submit"
              name="tier"
              value={t}
              className={
                'inline-flex items-center rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ' +
                (isActive
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
              }
            >
              {TIER_LABEL[t]}
            </button>
          )
        })}
      </div>
    </form>
  )
}

interface CreatorRow {
  id: string
  userId: string
  displayName: string
  handle: string
  subscriptionTier: 'MAKER' | 'BUILDER' | 'AGENCY'
  tierChangedAt: Date | null
  feeRateOverrideBp: number | null
  feeRateOverrideReason: string | null
  user: { email: string; name: string | null }
  _count: { brands: number }
  createdAt: Date
}

function CreatorsTable({ rows }: { rows: CreatorRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-[13px]">
        <thead className="bg-zinc-50 text-left text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          <tr>
            <th className="px-4 py-2.5">Creator</th>
            <th className="px-4 py-2.5">Email</th>
            <th className="px-4 py-2.5">Tier</th>
            <th className="px-4 py-2.5">Fee override</th>
            <th className="px-4 py-2.5">Brands</th>
            <th className="px-4 py-2.5">Last change</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => {
            const palette = CREATOR_TIER_STYLE[r.subscriptionTier]
            return (
              <tr key={r.id} className="hover:bg-zinc-50/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-zinc-900">{r.displayName}</div>
                  <div className="text-[11.5px] text-zinc-500">@{r.handle}</div>
                </td>
                <td className="px-4 py-2.5 text-zinc-700">{r.user.email}</td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
                    style={tierPillStyle(palette)}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: palette.dot }}
                    />
                    {palette.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.feeRateOverrideBp != null ? (
                    <span
                      className="inline-flex items-center gap-1 text-[12px] text-amber-800"
                      title={r.feeRateOverrideReason ?? ''}
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      {(r.feeRateOverrideBp / 100).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-zinc-700">{r._count.brands}</td>
                <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                  {r.tierChangedAt
                    ? new Date(r.tierChangedAt).toLocaleDateString()
                    : 'Never changed'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/tiers/creator/${r.id}`}
                    className="text-[11.5px] font-medium text-pink-700 hover:text-pink-900"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-6 text-center text-[13px] text-zinc-500">
      No creators match this filter.
    </div>
  )
}
