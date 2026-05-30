// REBUILD R15.c — Partners tab in admin Tiers module.
//
// Mirrors CreatorsTab shape but adds a service-type filter (a partner can
// declare multiple PartnerService rows; the filter is "matches any").
// Verified pill is rendered with reduced opacity when partner.status is
// not yet ACTIVE — Pavel decision 2026-05-30: Verified default is only
// "real" once activation completes.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { Input } from '@ilaunchify/ui'
import { Search, AlertTriangle, Lock } from 'lucide-react'
import { PARTNER_TIER_STYLE, tierPillStyle } from './tier-style'

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

  const rows = await prisma.partner.findMany(where as never)

  return (
    <section className="space-y-3">
      <FilterBar q={q} activeTier={tier} activeType={partnerType} />
      <PartnersTable rows={rows as never[]} />
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

interface PartnerRow {
  id: string
  companyName: string
  status: string
  tier: 'VERIFIED' | 'TRUSTED' | 'PREMIER'
  tierChangedAt: Date | null
  feeRateOverrideBp: number | null
  feeRateOverrideReason: string | null
  user: { email: string }
  services: Array<{ type: string }>
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  ACTIVE: { color: '#1D9E75', label: 'Active' },
  UNDER_REVIEW: { color: '#BA7517', label: 'Under review' },
  IN_PROGRESS: { color: '#378ADD', label: 'Onboarding' },
  INVITED: { color: '#888780', label: 'Invited' },
  SUSPENDED: { color: '#E24B4A', label: 'Suspended' },
  DRAFT: { color: '#888780', label: 'Draft' },
}

function PartnersTable({ rows }: { rows: PartnerRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-[13px]">
        <thead className="bg-zinc-50 text-left text-[10.5px] font-semibold uppercase tracking-widest text-zinc-500">
          <tr>
            <th className="px-4 py-2.5">Partner</th>
            <th className="px-4 py-2.5">Service type</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Tier</th>
            <th className="px-4 py-2.5">Fee override</th>
            <th className="px-4 py-2.5">Last change</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => {
            const palette = PARTNER_TIER_STYLE[r.tier]
            const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.DRAFT!
            // Verified default isn't "real" until ACTIVE — per Pavel.
            const tierPending = r.tier === 'VERIFIED' && r.status !== 'ACTIVE'
            const serviceLabels = r.services
              .map((s) => TYPE_LABEL[s.type] ?? s.type)
              .join(' · ')
            return (
              <tr key={r.id} className="hover:bg-zinc-50/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-zinc-900">{r.companyName}</div>
                  <div className="text-[11.5px] text-zinc-500">{r.user.email}</div>
                </td>
                <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                  {serviceLabels || '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-medium"
                    style={{ color: status.color }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: status.color }}
                    />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.04em]"
                    style={{
                      ...tierPillStyle(palette),
                      opacity: tierPending ? 0.55 : 1,
                    }}
                    title={
                      tierPending
                        ? 'Tier becomes effective once partner status flips to ACTIVE'
                        : undefined
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: palette.dot }}
                    />
                    {palette.label}
                    {tierPending && (
                      <Lock className="ml-0.5 h-2.5 w-2.5" aria-hidden="true" />
                    )}
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
                <td className="px-4 py-2.5 text-[11.5px] text-zinc-500">
                  {r.tierChangedAt
                    ? new Date(r.tierChangedAt).toLocaleDateString()
                    : 'Never changed'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/tiers/partner/${r.id}`}
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
      No partners match this filter.
    </div>
  )
}
