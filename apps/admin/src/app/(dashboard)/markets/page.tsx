// Admin Markets list — read-only V1 (#154).
//
// V1 surfaces the seeded Market rows so the admin can see jurisdiction
// coverage at a glance. No mutation — Market rows are seed-driven and need a
// DB migration to add (per docs/MARKETS_AND_REGIONS.md §6). Read-only suits
// the V1 footprint and keeps the existing seed authoritative.
//
// Columns:
//   • Code + name + jurisdiction
//   • Status pill (ACTIVE / COMING_SOON / DEPRECATED)
//   • Default language + cohabiting languages
//   • Counts: brands targeting + partners serving (cheap COUNT)
//
// Sidebar entry: Catalog → Markets (added in this slice).

import {
  Globe,
  Languages,
  Users,
  Building2,
  CheckCircle2,
  Clock,
  AlertOctagon,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Markets — Admin' }

type StatusTone = 'success' | 'warning' | 'danger'

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  COMING_SOON: 'warning',
  DEPRECATED: 'danger',
}

const TONE_PILL: Record<StatusTone, string> = {
  success: 'bg-success-50 text-success-700 border-success-200',
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border-danger-200',
}

const STATUS_ICON: Record<StatusTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertOctagon,
}

export default async function MarketsPage() {
  // Single round-trip — include everything the row needs to render.
  const markets = await prisma.market.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      defaultLanguage: { select: { code: true, name: true } },
      languages: {
        include: { language: { select: { code: true, name: true } } },
      },
      _count: {
        select: {
          regions: true,
          partnersServing: true,
          brandsTargeting: true,
        },
      },
    },
  })

  const activeCount = markets.filter((m) => m.status === 'ACTIVE').length
  const comingSoonCount = markets.filter((m) => m.status === 'COMING_SOON').length

  return (
    <div className="space-y-6">
      <Header
        title="Markets"
        subtitle="Regulatory jurisdictions iLaunchify ships into. Seeded — to add or change a market, run a migration."
        chips={[
          { icon: Globe, label: `${markets.length} total` },
          { icon: CheckCircle2, label: `${activeCount} ACTIVE`, tone: 'success' },
          ...(comingSoonCount > 0
            ? ([
                {
                  icon: Clock,
                  label: `${comingSoonCount} COMING_SOON`,
                  tone: 'warning' as const,
                },
              ] as const)
            : []),
        ]}
      />

      {markets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <Th>Market</Th>
                <Th>Regulator</Th>
                <Th>Languages</Th>
                <Th className="text-right">Regions</Th>
                <Th className="text-right">Brands</Th>
                <Th className="text-right">Partners</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {markets.map((m) => {
                const tone = STATUS_TONE[m.status] ?? 'danger'
                const Icon = STATUS_ICON[tone]
                const otherLangs = m.languages.filter(
                  (l) => l.language.code !== m.defaultLanguage?.code,
                )
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={
                            'mt-0.5 inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-[10px] font-bold uppercase tabular-nums text-ink-700'
                          }
                        >
                          {m.code}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900">{m.name}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1">
                            <span
                              className={
                                'inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wider ' +
                                TONE_PILL[tone]
                              }
                            >
                              <Icon className="h-2.5 w-2.5" aria-hidden="true" />
                              {m.status.replace(/_/g, ' ').toLowerCase()}
                            </span>
                            {m.region && (
                              <span className="ml-1 text-[11px] text-ink-500">
                                {m.region}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-ink-700">
                      {m.jurisdictionAct}
                      <p className="mt-0.5 text-[10.5px] text-ink-500">
                        {m.currency}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {m.defaultLanguage && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-wider text-pink-700">
                            <Languages className="h-2.5 w-2.5" />
                            {m.defaultLanguage.code} · default
                          </span>
                        )}
                        {otherLangs.map((l) => (
                          <span
                            key={l.language.code}
                            className="inline-flex rounded-full border border-ink-200 bg-white px-2 py-[2px] text-[10.5px] font-medium uppercase tracking-wider text-ink-700"
                          >
                            {l.language.code}
                            {l.isRequired && (
                              <span className="ml-1 text-pink-700">·required</span>
                            )}
                          </span>
                        ))}
                        {!m.defaultLanguage && otherLangs.length === 0 && (
                          <span className="text-[11px] text-ink-400">—</span>
                        )}
                      </div>
                    </td>
                    <NumCell n={m._count.regions} />
                    <NumCell n={m._count.brandsTargeting} icon={Building2} />
                    <NumCell n={m._count.partnersServing} icon={Users} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Local helpers
// =============================================================================

function Header({
  title,
  subtitle,
  chips,
}: {
  title: string
  subtitle: string
  chips: Array<{
    icon: typeof Globe
    label: string
    tone?: StatusTone
  }>
}) {
  return (
    <AdminPageHeader
      eyebrow="Catalog"
      title={title}
      description={subtitle}
      actions={
        <div className="flex flex-wrap gap-2">
          {chips.map((c, idx) => (
            <span
              key={idx}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-medium ' +
                (c.tone
                  ? TONE_PILL[c.tone]
                  : 'border-ink-200 bg-white text-ink-700')
              }
            >
              <c.icon className="h-3 w-3" aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      }
    />
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
    <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/40 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-pink-700"
      >
        <Globe className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
        No markets seeded
      </h2>
      <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-ink-600">
        Run <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[11.5px]">
          pnpm seed
        </code>{' '}
        to populate the default US / CA markets.
      </p>
    </div>
  )
}
