// Admin Dashboard — clickable KPI metric tile.
//
// Locked design system pattern (DESIGN_SYSTEM.md §8):
//   • White card, hairline border, gentle hover lift
//   • Big numeral (font-display, tabular-nums, weight 600)
//   • Colored numeral tone keyed off `tone` prop (ink default, pink hot,
//     success/warning/info/neon semantic)
//   • Delta line: tiny arrow + percentage, semantic-colored
//   • Whole card is a `<Link>` so clicks land on the relevant subroute
//   • focus-visible ring (WCAG 2.4.7)

import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  PackageOpen,
  DollarSign,
  Users,
  Building2,
  Box,
  Inbox,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@ilaunchify/ui'
import type { KpiCard as KpiCardData } from '../dashboard-data'

const ICON_MAP: Record<KpiCardData['iconKey'], LucideIcon> = {
  orders: PackageOpen,
  revenue: DollarSign,
  creators: Users,
  partners: Building2,
  products: Box,
  leads: Inbox,
}

const TONE_NUMERAL: Record<KpiCardData['tone'], string> = {
  ink: 'text-ink-900',
  pink: 'text-pink-700',
  // neon would fail contrast on white; for kpi tiles fall back to ink with a
  // neon icon dot. Pavel's rule: never neon text on light surfaces.
  neon: 'text-ink-900',
  success: 'text-success-700',
  warning: 'text-warning-700',
  info: 'text-info-700',
}

const TONE_ICON_BG: Record<KpiCardData['tone'], string> = {
  ink: 'bg-ink-100 text-ink-700',
  pink: 'bg-pink-100 text-pink-700',
  neon: 'bg-neon-500 text-ink-900',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  info: 'bg-info-50 text-info-700',
}

export function KpiCard({ data }: { data: KpiCardData }) {
  const Icon = ICON_MAP[data.iconKey]
  const value = formatValue(data)

  return (
    <Link
      href={data.href}
      className={cn(
        'group block rounded-2xl border border-ink-200 bg-white p-5',
        'transition-[transform,box-shadow,border-color] duration-base ease-out-quart',
        'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
      )}
    >
      <div className="flex items-start justify-between">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            TONE_ICON_BG[data.tone],
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {data.delta && <DeltaChip delta={data.delta} />}
      </div>

      <div className="mt-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-700">
          {data.label}
        </p>
        <p
          className={cn(
            'mt-1 font-display text-[34px] font-semibold leading-none tabular-nums tracking-tight',
            TONE_NUMERAL[data.tone],
          )}
        >
          {value}
        </p>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatValue(d: KpiCardData) {
  const n = d.value
  let str: string
  if (n >= 1_000_000) str = (n / 1_000_000).toFixed(1) + 'M'
  else if (n >= 10_000) str = (n / 1000).toFixed(0) + 'k'
  else if (n >= 1000) str = (n / 1000).toFixed(1) + 'k'
  else str = String(n)
  return `${d.prefix ?? ''}${str}${d.suffix ?? ''}`
}

function DeltaChip({
  delta,
}: {
  delta: NonNullable<KpiCardData['delta']>
}) {
  const ArrowIcon =
    delta.direction === 'up'
      ? ArrowUpRight
      : delta.direction === 'down'
        ? ArrowDownRight
        : Minus
  const cls =
    delta.direction === 'up'
      ? 'bg-success-50 text-success-700'
      : delta.direction === 'down'
        ? 'bg-danger-50 text-danger-700'
        : 'bg-ink-100 text-ink-600'
  const sign =
    delta.direction === 'flat' ? '0%' : `${Math.abs(delta.pct)}%`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-[3px] text-[11px] font-semibold tabular-nums',
        cls,
      )}
    >
      <ArrowIcon className="h-3 w-3" aria-hidden="true" />
      <span>{sign}</span>
    </span>
  )
}
