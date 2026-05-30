// REBUILD R15.c + R16.b — Partners tab in admin Tiers module.
//
// R15.c shipped a read-only list with service-type filter + Verified
// lock badge for not-yet-ACTIVE partners. R16.b lifts the table body
// into PartnersBulkTable (client) so admin can multi-select and bulk
// promote/demote. This file stays a server component — it loads rows,
// flattens them, and delegates to the client wrapper.

import { prisma } from '@ilaunchify/db'
import { Input } from '@ilaunchify/ui'
import { Search } from 'lucide-react'
import { PartnersBulkTable } from './PartnersBulkTable'

interface Props {
  q: string
  tier: string
  partnerType: string
}

const TIER_FILTERS = ['', 'VERIFIED', 'TRUSTED', 'PREMIER'] as const
const TIER_LABEL: Record<string, string> = {
  '': 'All tiers',
  VERIFIED: 'Verified',
  TRUSTED: 'Trusted',
  PREMIER: 'Premier',
}

const TYPE_FILTERS = [
  '',
  'MANUFACTURING',
  'LABEL_PRINTING',
  'COPACKING',
  'WAREHOUSE',
] as const
const TYPE_LABEL: Record<string, string> = {
  '': 'All types',
  MANUFACTURING: 'Manufacturer',
  LABEL_PRINTING: 'Printer',
  COPACKING: 'Co-packer',
  WAREHOUSE: 'Warehouse',
}

export async function PartnersTab({ q, tier, partnerType }: Props) {
  const where: Parameters<typeof prisma.partner.findMany>[0] = {
    where: {
      ...(q.trim()
        ? {
            OR: [
              { companyName: { contains: q.trim(), mode: 'insensitive' } },
              { legalName: { contains: q.trim(), mode: 'insensitive' } },
              { user: { email: { contains: q.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(tier && ['VERIFIED', 'TRUSTED', 'PREMIER'].includes(tier)
        ? { tier: tier as 'VERIFIED' | 'TRUSTED' | 'PREMIER' }
        : {}),
      ...(partnerType &&
      ['MANUFACTURING', 'LABEL_PRINTING', 'COPACKING', 'WAREHOUSE'].includes(
        partnerType,
      )
        ? {
            services: {
              some: {
                type: partnerType as
                  | 'MANUFACTURING'
                  | 'LABEL_PRINTING'
                  | 'COPACKING'
                  | 'WAREHOUSE',
              },
            },
          }
        : {}),
    },
    orderBy: [{ tierChangedAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      user: { select: { email: true } },
      services: { select: { type: true } },
    },
  } as Parameters<typeof prisma.partner.findMany>[0]

  const rows = (await prisma.partner.findMany(where as never)) as unknown as Array<{
    id: string
    companyName: string
    status: string
    tier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
    tierChangedAt: Date | null
    feeRateOverrideBp: number | null
    feeRateOverrideReason: string | null
    user: { email: string }
    services: Array<{ type: string }>
  }>

  // Flatten the service-types into the display string here so the
  // client table doesn't need the TYPE_LABEL vocabulary again.
  const tableRows = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    email: r.user.email,
    status: r.status,
    tier: r.tier,
    tierChangedAt: r.tierChangedAt,
    feeRateOverrideBp: r.feeRateOverrideBp,
    feeRateOverrideReason: r.feeRateOverrideReason,
    serviceLabels: r.services
      .map((s) => TYPE_LABEL[s.type] ?? s.type)
      .join(' · '),
  }))

  return (
    <section className="space-y-3">
      <FilterBar q={q} activeTier={tier} activeType={partnerType} />
      <PartnersBulkTable rows={tableRows} />
      {rows.length === 0 && <EmptyHint />}
    </section>
  )
}

function FilterBar({
  q,
  activeTier,
  activeType,
}: {
  q: string
  activeTier: string
  activeType: string
}) {
  return (
    <form className="flex flex-wrap items-center gap-3" action="/tiers" method="get">
      <input type="hidden" name="tab" value="partners" />
      <div className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search partner name or contact…"
          className="pl-9 text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIER_FILTERS.map((t) => {
          const isActive = activeTier === t
          return (
            <button
              key={t || 'all-tiers'}
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
      <div className="flex flex-wrap gap-1.5 border-l border-zinc-200 pl-3">
        {/* The hidden tier input keeps the active tier when the type
            pill is clicked — otherwise tier resets every type click. */}
        <input type="hidden" name="tier" value={activeTier} />
        {TYPE_FILTERS.map((t) => {
          const isActive = activeType === t
          return (
            <button
              key={t || 'all-types'}
              type="submit"
              name="partnerType"
              value={t}
              className={
                'inline-flex items-center rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ' +
                (isActive
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50')
              }
            >
              {TYPE_LABEL[t]}
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
      No partners match this filter.
    </div>
  )
}
