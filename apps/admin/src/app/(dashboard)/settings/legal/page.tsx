import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { KpiWidget } from '@ilaunchify/ui'
import { FileText, ShieldCheck, BadgeCheck, PencilRuler, Users } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { LegalRowActions } from './LegalRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Legal Documents — Admin' }

const KIND_CHIPS = [
  { label: 'All kinds', value: null },
  { label: 'Policies', value: 'POLICY' },
  { label: 'Agreements', value: 'AGREEMENT' },
  { label: 'Notices', value: 'NOTICE' },
] as const

const AUDIENCE_CHIPS = [
  { label: 'All audiences', value: null },
  { label: 'Everyone', value: 'ALL' },
  { label: 'Public', value: 'PUBLIC' },
  { label: 'Creators', value: 'CREATOR' },
  { label: 'Partners', value: 'PARTNER' },
] as const

interface Props {
  searchParams: Promise<{ kind?: string; audience?: string }>
}

export default async function LegalDocumentsPage({ searchParams }: Props) {
  await requireCapability('platform:admin')
  const sp = await searchParams
  const kind = sp.kind ?? null
  const audience = sp.audience ?? null

  const [docs, totalAcceptances] = await Promise.all([
    prisma.legalDocument.findMany({
      where: {
        ...(kind ? { kind: kind as 'POLICY' | 'AGREEMENT' | 'NOTICE' } : {}),
        ...(audience ? { audience: audience as 'PUBLIC' | 'CREATOR' | 'PARTNER' | 'ALL' } : {}),
      },
      orderBy: [{ kind: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        kind: true,
        audience: true,
        requiresAcceptance: true,
        isActive: true,
        currentVersionId: true,
        updatedAt: true,
        versions: { select: { id: true, version: true, status: true } },
        _count: { select: { acceptances: true } },
      },
    }),
    prisma.legalAcceptance.count(),
  ])

  // KPIs computed over the full set (independent of the active filter).
  const all = await prisma.legalDocument.findMany({
    select: { isActive: true, requiresAcceptance: true, currentVersionId: true, versions: { select: { status: true } } },
  })
  const activeCount = all.filter((d) => d.isActive).length
  const requiringAcceptance = all.filter((d) => d.requiresAcceptance).length
  const publishedCount = all.filter((d) => d.currentVersionId != null).length
  const draftsPending = all.filter(
    (d) => d.versions.some((v) => v.status === 'DRAFT') && d.currentVersionId == null,
  ).length

  const buildHref = (patch: { kind?: string | null; audience?: string | null }) => {
    const next = { kind, audience, ...patch }
    const params = new URLSearchParams()
    if (next.kind) params.set('kind', next.kind)
    if (next.audience) params.set('audience', next.audience)
    const q = params.toString()
    return q ? `/settings/legal?${q}` : '/settings/legal'
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Platform · Legal"
        title="Legal documents"
        description="Author and version every policy, agreement, and notice. Editing here creates drafts; publishing (next phase) swaps the live page and triggers re-acceptance + notice email for material changes."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-10">
        <KpiWidget span={2} label="Active documents" value={activeCount} tone="ink" icon={FileText} />
        <KpiWidget span={2} label="Require acceptance" value={requiringAcceptance} tone="pink" icon={ShieldCheck} />
        <KpiWidget span={2} label="Published" value={publishedCount} tone="success" icon={BadgeCheck} />
        <KpiWidget span={2} label="Drafts pending" value={draftsPending} tone="warning" icon={PencilRuler} sublabel="not yet published" />
        <KpiWidget span={2} label="Acceptances logged" value={totalAcceptances} tone="info" icon={Users} />
      </div>

      <div className="space-y-2">
        <FilterRow ariaLabel="Filter by kind">
          {KIND_CHIPS.map((c) => (
            <Chip key={c.label} href={buildHref({ kind: c.value })} active={kind === c.value}>{c.label}</Chip>
          ))}
        </FilterRow>
        <FilterRow ariaLabel="Filter by audience">
          {AUDIENCE_CHIPS.map((c) => (
            <Chip key={c.label} href={buildHref({ audience: c.value })} active={audience === c.value}>{c.label}</Chip>
          ))}
        </FilterRow>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-ink-50/70 text-[10.5px] uppercase tracking-[0.06em] text-ink-500">
            <tr>
              <Th>Document</Th>
              <Th>Kind</Th>
              <Th>Audience</Th>
              <Th>Live version</Th>
              <Th>Draft</Th>
              <Th>Acceptance</Th>
              <Th>Acceptances</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {docs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-ink-500">
                  No documents match this filter.
                </td>
              </tr>
            ) : (
              docs.map((d) => {
                const live = d.versions.find((v) => v.id === d.currentVersionId)
                const draft = d.versions.find((v) => v.status === 'DRAFT')
                return (
                  <tr key={d.id} className="hover:bg-ink-50/40">
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/settings/legal/${d.slug}`}
                        className="font-display font-semibold text-ink-900 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1"
                      >
                        {d.title}
                      </Link>
                      <div className="font-mono text-[11px] text-ink-500">/{d.slug}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-ink-700">{d.kind}</td>
                    <td className="px-4 py-3 align-top text-ink-700">{d.audience}</td>
                    <td className="px-4 py-3 align-top">
                      {live ? (
                        <span className="font-mono text-ink-900">{live.version}</span>
                      ) : (
                        <span className="text-ink-400">— none live</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {draft ? (
                        <span className="rounded-full border border-warning-200 bg-warning-50 px-2 py-[2px] font-mono text-[11px] font-semibold text-warning-800">{draft.version}</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {d.requiresAcceptance ? (
                        <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-[2px] text-[11px] font-semibold text-pink-700">Required</span>
                      ) : (
                        <span className="rounded-full border border-ink-200 bg-ink-100 px-2 py-[2px] text-[11px] font-semibold text-ink-600">Notify-only</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums text-ink-700">{d._count.acceptances}</td>
                    <td className="px-4 py-3 align-top text-right">
                      <LegalRowActions slug={d.slug} title={d.title} documentId={d.id} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={'px-4 py-2.5 text-left font-semibold ' + (className ?? '')}>{children}</th>
}

function FilterRow({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {children}
    </nav>
  )
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1 ' +
        (active
          ? 'border-success-500 bg-success-50 text-success-800'
          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900')
      }
    >
      {children}
    </Link>
  )
}
