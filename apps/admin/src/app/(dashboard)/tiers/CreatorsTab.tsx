// REBUILD R15.c + R16.b — Creators tab in admin Tiers module.
//
// R15.c shipped a read-only list. R16.b lifts the table body into a
// client component (CreatorsBulkTable) that owns selection state +
// renders the BulkTierActions bar. This file stays a server component:
// it loads the rows, flattens them into the table-row shape, and hands
// off to the client wrapper.

import { prisma } from '@ilaunchify/db'
import { Input } from '@ilaunchify/ui'
import { Search } from 'lucide-react'
import { CreatorsBulkTable } from './CreatorsBulkTable'

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

  const rows = (await prisma.creatorProfile.findMany(where as never)) as unknown as Array<{
    id: string
    displayName: string
    handle: string
    subscriptionTier: 'MAKER' | 'BUILDER' | 'AGENCY'
    tierChangedAt: Date | null
    feeRateOverrideBp: number | null
    feeRateOverrideReason: string | null
    user: { email: string; name: string | null }
    _count: { brands: number }
  }>

  // Flatten Prisma's nested user/_count into the row shape the client
  // table expects. Keeps the client component free of Prisma typings.
  const tableRows = rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    handle: r.handle,
    subscriptionTier: r.subscriptionTier,
    tierChangedAt: r.tierChangedAt,
    feeRateOverrideBp: r.feeRateOverrideBp,
    feeRateOverrideReason: r.feeRateOverrideReason,
    email: r.user.email,
    brandCount: r._count.brands,
  }))

  return (
    <section className="space-y-3">
      <FilterBar q={q} activeTier={tier} />
      <CreatorsBulkTable rows={tableRows} />
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

function EmptyHint() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 p-6 text-center text-[13px] text-zinc-500">
      No creators match this filter.
    </div>
  )
}
