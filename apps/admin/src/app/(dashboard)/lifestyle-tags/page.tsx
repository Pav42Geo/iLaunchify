// =============================================================================
// /admin/lifestyle-tags — Layer 4 LifestyleTag CRUD
// =============================================================================
//
// Discovery + personalization vocabulary, 30 tags across Lifestyle / Audience
// / Trend groups. Admin-curated to prevent vocabulary drift. URL-driven
// segmented tab (?group=lifestyle|audience|trend|all, default = all).

import Link from 'next/link'
import {
  Tag,
  Heart,
  Users,
  Flame,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import type { LifestyleTagGroup } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { LifestyleTagFormDialog } from './LifestyleTagFormDialog'
import {
  DeleteLifestyleTagButton,
  LifestyleTagActiveToggle,
} from './LifestyleTagRowControls'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lifestyle tags — Admin' }

type Tab = 'all' | 'lifestyle' | 'audience' | 'trend'

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'all', label: 'All', icon: Tag },
  { key: 'lifestyle', label: 'Lifestyle', icon: Heart },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'trend', label: 'Trend', icon: Flame },
]

const GROUP_LABEL: Record<LifestyleTagGroup, string> = {
  LIFESTYLE: 'Lifestyle',
  AUDIENCE: 'Audience',
  TREND: 'Trend',
}

const GROUP_TONE: Record<LifestyleTagGroup, string> = {
  LIFESTYLE: 'bg-pink-50 text-pink-700 border-pink-200',
  AUDIENCE: 'bg-sky-50 text-sky-700 border-sky-200',
  TREND: 'bg-amber-50 text-amber-800 border-amber-200',
}

function tabToGroup(t: Tab): LifestyleTagGroup | null {
  if (t === 'lifestyle') return 'LIFESTYLE'
  if (t === 'audience') return 'AUDIENCE'
  if (t === 'trend') return 'TREND'
  return null
}

function isValidTab(s: string | undefined): s is Tab {
  return s === 'all' || s === 'lifestyle' || s === 'audience' || s === 'trend'
}

interface PageProps {
  searchParams: Promise<{ group?: string }>
}

export default async function LifestyleTagsPage({ searchParams }: PageProps) {
  await requireRole(['ADMIN'])
  const sp = await searchParams
  const activeTab: Tab = isValidTab(sp.group) ? sp.group : 'all'
  const groupFilter = tabToGroup(activeTab)

  const where = groupFilter ? { group: groupFilter } : {}

  const [tags, groupCounts, total] = await Promise.all([
    prisma.lifestyleTag.findMany({
      where,
      orderBy: [{ group: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        group: true,
        description: true,
        iconEmoji: true,
        accentHex: true,
        displayOrder: true,
        isActive: true,
        _count: { select: { productTemplates: true } },
      },
    }),
    prisma.lifestyleTag.groupBy({
      by: ['group'],
      _count: { _all: true },
    }),
    prisma.lifestyleTag.count(),
  ])

  const counts: Record<LifestyleTagGroup, number> = {
    LIFESTYLE: 0,
    AUDIENCE: 0,
    TREND: 0,
  }
  for (const g of groupCounts) {
    counts[g.group] = g._count._all
  }
  const lifestyleCount = counts.LIFESTYLE ?? 0
  const audienceCount = counts.AUDIENCE ?? 0
  const trendCount = counts.TREND ?? 0

  return (
    <div className="space-y-6">
      <Header
        total={total}
        lifestyleCount={lifestyleCount}
        audienceCount={audienceCount}
        trendCount={trendCount}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabBar active={activeTab} counts={counts} total={total} />
        <LifestyleTagFormDialog
          mode="create"
          defaultGroup={groupFilter ?? undefined}
        />
      </div>

      {tags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
            <Tag className="h-5 w-5" />
          </span>
          <h3 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
            No tags here yet
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-500">
            Click "Add tag" to create one in this group.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tags.map((t) => {
            const accent = t.accentHex || '#FF2E63'
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-ink-200 bg-white p-4 transition-shadow hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)]"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                    style={{
                      backgroundColor: `${accent}1A`,
                      color: accent,
                    }}
                  >
                    {t.iconEmoji ?? '·'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] font-semibold leading-tight text-ink-900">
                      {t.name}
                    </p>
                    <code className="mt-0.5 inline-block rounded bg-ink-50 px-1.5 py-0.5 text-[10.5px] text-ink-600">
                      {t.slug}
                    </code>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                      GROUP_TONE[t.group]!,
                    )}
                  >
                    {GROUP_LABEL[t.group]}
                  </span>
                </div>
                {t.description && (
                  <p className="mt-2 line-clamp-2 text-[11.5px] text-ink-600">
                    {t.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
                  <p className="text-[11px] text-ink-500 tabular-nums">
                    {t._count.productTemplates} product{t._count.productTemplates === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <LifestyleTagActiveToggle tagId={t.id} isActive={t.isActive} />
                    <LifestyleTagFormDialog
                      mode="edit"
                      tag={{
                        id: t.id,
                        slug: t.slug,
                        name: t.name,
                        group: t.group,
                        description: t.description,
                        iconEmoji: t.iconEmoji,
                        accentHex: t.accentHex,
                        displayOrder: t.displayOrder,
                        isActive: t.isActive,
                      }}
                    />
                    <DeleteLifestyleTagButton
                      tagId={t.id}
                      name={t.name}
                      usageCount={t._count.productTemplates}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header — cream band + 4-card KPI strip
// -----------------------------------------------------------------------------

function Header({
  total,
  lifestyleCount,
  audienceCount,
  trendCount,
}: {
  total: number
  lifestyleCount: number
  audienceCount: number
  trendCount: number
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-4">
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-700">
          Marketplace · Lifestyle Tags
        </p>
        <h1 className="font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Lifestyle tags
        </h1>
        <p className="max-w-2xl text-[13px] text-ink-600">
          Discovery + personalization vocabulary. 30 tags across Lifestyle / Audience / Trend groups. Admin-curated to prevent vocabulary drift.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          href="/lifestyle-tags"
          label="Total tags"
          value={total}
          icon={Tag}
          tone="pink"
        />
        <KpiCard
          href="/lifestyle-tags?group=lifestyle"
          label="Lifestyle"
          value={lifestyleCount}
          icon={Heart}
          tone="pink"
        />
        <KpiCard
          href="/lifestyle-tags?group=audience"
          label="Audience"
          value={audienceCount}
          icon={Users}
          tone="sky"
        />
        <KpiCard
          href="/lifestyle-tags?group=trend"
          label="Trend"
          value={trendCount}
          icon={Flame}
          tone="amber"
        />
      </div>
    </div>
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
  value: number
  icon: LucideIcon
  tone: 'pink' | 'amber' | 'emerald' | 'sky'
}) {
  const iconTone: Record<'pink' | 'amber' | 'emerald' | 'sky', string> = {
    pink: 'bg-pink-100 text-pink-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
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
          <p className="font-display text-[22px] font-bold leading-none text-ink-900">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

// -----------------------------------------------------------------------------
// TabBar — pill-style segmented control
// -----------------------------------------------------------------------------

function TabBar({
  active,
  counts,
  total,
}: {
  active: Tab
  counts: Record<LifestyleTagGroup, number>
  total: number
}) {
  function countFor(t: Tab): number {
    if (t === 'all') return total
    if (t === 'lifestyle') return counts.LIFESTYLE!
    if (t === 'audience') return counts.AUDIENCE!
    return counts.TREND!
  }

  return (
    <nav
      aria-label="Lifestyle tag groups"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-ink-200 bg-white p-0.5"
    >
      {TABS.map((t: { key: Tab; label: string; icon: LucideIcon }) => {
        const isActive = t.key === active
        const Icon = t.icon
        const href = t.key === 'all' ? '/lifestyle-tags' : `/lifestyle-tags?group=${t.key}`
        const count = countFor(t.key)
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2',
              isActive
                ? 'bg-ink-900 text-white'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t.label}
            <span
              className={cn(
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
                isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600',
              )}
            >
              {count}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
