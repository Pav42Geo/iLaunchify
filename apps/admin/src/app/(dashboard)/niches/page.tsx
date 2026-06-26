// =============================================================================
// /admin/niches — Layer 1 Creator Niches (locked vocabulary)
// =============================================================================
//
// 8 audience-lens niches. Admin can edit copy / colors / icon / displayOrder,
// NOT add or remove (vocabulary is locked per Pavel 2026-06-01).
//
// Layout follows the locked admin v2 surface pattern (cream rounded-3xl hero
// band + 4-card KPI strip + sortable table + RowActionsMenu pattern). See
// memory ilaunchify-admin-surface-pattern.

import Link from 'next/link'
import {
  Sparkles,
  Tag,
  Workflow,
  Lock,
  ArrowRight,
  GripVertical,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { NicheEditDialog } from './NicheEditDialog'
import { NicheActiveToggle, NicheReorderControls } from './NicheRowControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Niches — Admin' }

export default async function NichesPage() {
  await requireRole(['ADMIN'])

  const [
    niches,
    subcatJunctionCount,
    activeRuleCount,
    lockedRuleCount,
  ] = await Promise.all([
    prisma.niche.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        iconEmoji: true,
        accentHex: true,
        displayOrder: true,
        isActive: true,
        _count: {
          select: {
            subcategories: true,
            rules: { where: { isActive: true } },
          },
        },
      },
    }),
    prisma.nicheSubcategory.count(),
    prisma.nicheRule.count({ where: { isActive: true } }),
    prisma.nicheRule.count({ where: { isLocked: true } }),
  ])

  const totalNiches = niches.length

  return (
    <div className="space-y-6">
      <Header
        total={totalNiches}
        subcatJunctions={subcatJunctionCount}
        activeRules={activeRuleCount}
        lockedRules={lockedRuleCount}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink-900">
            Locked niche vocabulary
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Admin can edit copy / color / icon / order — not the set itself.
          </p>
        </div>
        <Link
          href="/niches/rules"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-[12.5px] font-semibold text-ink-700 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
        >
          <Workflow className="h-3.5 w-3.5" />
          Manage auto-rules
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <th scope="col" className="px-3 py-3 w-10" aria-label="Reorder" />
              <th scope="col" className="px-4 py-3">Niche</th>
              <th scope="col" className="px-4 py-3">Slug</th>
              <th scope="col" className="px-4 py-3 tabular-nums">Subcats</th>
              <th scope="col" className="px-4 py-3 tabular-nums">Active rules</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {niches.map((n) => {
              const accent = n.accentHex || '#FF2E63'
              return (
                <tr key={n.id} className="hover:bg-pink-50/20">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex h-5 w-5 cursor-grab items-center justify-center text-ink-300">
                        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <NicheReorderControls nicheId={n.id} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
                        style={{
                          backgroundColor: `${accent}1A`, // ~10% alpha
                          color: accent,
                        }}
                      >
                        {n.iconEmoji ?? '·'}
                      </span>
                      <div>
                        <p className="font-display text-[14px] font-semibold leading-tight text-ink-900">
                          {n.name}
                        </p>
                        {n.description && (
                          <p className="mt-0.5 line-clamp-1 max-w-md text-[11.5px] text-ink-500">
                            {n.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-700">
                      {n.slug}
                    </code>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink-900">
                    {n._count.subcategories}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink-900">
                    {n._count.rules}
                  </td>
                  <td className="px-4 py-3">
                    <NicheActiveToggle nicheId={n.id} isActive={n.isActive} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <NicheEditDialog
                        niche={{
                          id: n.id,
                          name: n.name,
                          description: n.description,
                          iconEmoji: n.iconEmoji,
                          accentHex: n.accentHex,
                          displayOrder: n.displayOrder,
                        }}
                      />
                      <Link
                        href={`/niches/${n.slug}/subcategories`}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-ink-200 bg-white px-3 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                      >
                        Subcategories
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header — cream band + 4-card KPI strip
// -----------------------------------------------------------------------------

function Header({
  total,
  subcatJunctions,
  activeRules,
  lockedRules,
}: {
  total: number
  subcatJunctions: number
  activeRules: number
  lockedRules: number
}) {
  return (
    <>
      <AdminPageHeader
        eyebrow="Marketplace · Niches"
        title="Creator Niches"
        description="8 audience-lens lenses creators identify with. Locked vocabulary — admin can edit copy / colors / icon but not add / remove rows."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          href="/niches"
          label="Total niches"
          value={`${total} / 8 locked`}
          icon={Sparkles}
          tone="pink"
        />
        <KpiCard
          href="/niches"
          label="Subcategory mappings"
          value={subcatJunctions.toLocaleString()}
          icon={Tag}
          tone="sky"
        />
        <KpiCard
          href="/niches/rules"
          label="Active auto-rules"
          value={activeRules.toLocaleString()}
          icon={Workflow}
          tone="emerald"
        />
        <KpiCard
          href="/niches/rules"
          label="Locked rules"
          value={lockedRules.toLocaleString()}
          icon={Lock}
          tone="amber"
        />
      </div>
    </>
  )
}

function KpiCard({
  href,
  label,
  value,
  icon: Icon,
  tone,
}: {
  href: string
  label: string
  value: string | number
  icon: LucideIcon
  tone: 'pink' | 'amber' | 'emerald' | 'sky'
}) {
  const iconTone: Record<'pink' | 'amber' | 'emerald' | 'sky', string> = {
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-warning-100 text-warning-700',
    emerald: 'bg-success-100 text-success-700',
    sky: 'bg-info-100 text-info-700',
  }
  return (
    <Link
      href={href}
      className={cn(
        'group relative rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-shadow',
        'hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-xl',
            iconTone[tone]!,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-700">
            {label}
          </p>
          <p className="font-display text-[20px] font-bold leading-none text-ink-900">
            {value}
          </p>
        </div>
      </div>
    </Link>
  )
}
