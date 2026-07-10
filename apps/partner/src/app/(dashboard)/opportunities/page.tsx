import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CoCreationStepper, nicheGradientKey } from '@ilaunchify/ui'
import { productGradient } from '@ilaunchify/ui/tokens'
import { getActingPartner } from '@/lib/partner-context'
import { loadOpportunityPool, type PoolEntry } from './loader'
import { ExpressInterestDialog } from './ExpressInterestDialog'
import { WithdrawInterestButton } from './WithdrawInterestButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Opportunities — iLaunchify Partners' }

// Opportunity Pool — niche/capability-matched feed of creator briefs +
// Express Interest (terms only, never a recipe). CO_CREATION_MARKETPLACE_SPEC
// §16 P0, prototype screen ②. URL-driven tabs/sort per the partner list-page
// pattern (products/page.tsx is the reference).

type Tab = 'matched' | 'all' | 'mine'
type SortKey = 'fit' | 'new'

const MATCHED_FIT_THRESHOLD = 80

const INTEREST_PILL: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: '⏳ Awaiting shortlist', cls: 'border-info-200 bg-info-50 text-info-800' },
  SHORTLISTED: { label: '★ Shortlisted', cls: 'border-warning-200 bg-warning-50 text-warning-800' },
  SELECTED: { label: '✓ Selected — you won!', cls: 'border-success-200 bg-success-50 text-success-800' },
  PASSED: { label: 'Creator chose another maker', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
  WITHDRAWN: { label: 'Withdrawn', cls: 'border-ink-200 bg-ink-100 text-ink-700' },
}

function buildHref(params: { tab?: Tab; sort?: SortKey; cat?: string }): string {
  const q = new URLSearchParams()
  if (params.tab && params.tab !== 'matched') q.set('tab', params.tab)
  if (params.sort && params.sort !== 'fit') q.set('sort', params.sort)
  if (params.cat) q.set('cat', params.cat)
  const s = q.toString()
  return s ? `/opportunities?${s}` : '/opportunities'
}

function postedAgo(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; cat?: string }>
}) {
  const user = await requireUser()
  const acting = await getActingPartner(user.id)
  if (!acting) redirect('/dashboard')
  const { partner } = acting
  if (partner.status !== 'ACTIVE' && partner.status !== 'INTEGRATION_ENHANCED') {
    redirect('/dashboard')
  }

  const sp = await searchParams
  const tab: Tab = sp.tab === 'all' || sp.tab === 'mine' ? sp.tab : 'matched'
  const sort: SortKey = sp.sort === 'new' ? 'new' : 'fit'
  const cat = sp.cat ?? ''

  const [{ facts, entries, myInterests }, niches] = await Promise.all([
    loadOpportunityPool(partner.id),
    prisma.niche.findMany({ where: { isActive: true }, select: { slug: true, name: true, iconEmoji: true } }),
  ])
  const nicheBySlug = new Map(niches.map((n) => [n.slug, n]))

  // Category chips from what's actually in the pool.
  const cats = [...new Set(entries.map((e) => e.categoryName).filter((c): c is string => !!c))]

  let list: PoolEntry[] = entries
  if (tab === 'matched') list = list.filter((e) => e.fitScore >= MATCHED_FIT_THRESHOLD)
  if (cat) list = list.filter((e) => e.categoryName === cat)
  list = [...list].sort((a, b) =>
    sort === 'new'
      ? (b.brief.createdAt ?? '').localeCompare(a.brief.createdAt ?? '')
      : b.fitScore - a.fitScore,
  )

  const matchedCount = entries.filter((e) => e.fitScore >= MATCHED_FIT_THRESHOLD).length

  const capabilityNames = facts.nicheSlugs
    .map((s) => nicheBySlug.get(s)?.name)
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ')

  return (
    <>
      {/* Maker journey stepper — full-bleed direct child of the layout grid. */}
      <CoCreationStepper
        className="col-span-full -mt-6 mb-s-5"
        steps={[
          { key: 'pool', label: 'Opportunity pool', state: 'current' },
          { key: 'room', label: 'Collaboration room', state: 'upcoming' },
        ]}
      />
      <div className="space-y-6">
      {/* Pool header (demo .briefhdr — maker identity + capability line) */}
      <div className="flex items-center gap-s-3 rounded-xl border border-ink-200 bg-ink-50 px-s-4 py-s-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink-900 text-ui-section text-white">
          🏭
        </span>
        <div>
          <h1 className="flex items-center gap-s-2 font-display text-ui-section">
            {partner.companyName}
            <span className="rounded-pill bg-success-50 px-s-2 py-0.5 text-ui-label tracking-normal text-success-700">
              ✓ Verified
            </span>
          </h1>
          <p className="text-ui-caption text-ink-500">
            {capabilityNames
              ? `Your capabilities: ${capabilityNames} — briefs are matched to your published products.`
              : 'Matching works off your published products.'}{' '}
            Express interest with fit &amp; terms — never a formula.
          </p>
        </div>
      </div>

      {/* Tabs + sort (demo .tabs underline style with count badges) */}
      <div className="flex flex-wrap items-center gap-s-2 border-b border-ink-100">
        {(
          [
            ['matched', 'Matched to you', matchedCount],
            ['all', 'All open', entries.length],
            ['mine', 'My interests', myInterests.length],
          ] as const
        ).map(([t, label, count]) => (
          <Link
            key={t}
            href={buildHref({ tab: t, sort })}
            className={`mr-s-4 border-b-2 px-s-1 py-s-2 text-ui-caption font-bold transition ${
              tab === t ? 'border-pink-500 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {label}
            <span
              className={`ml-s-1 rounded-pill px-s-2 py-0.5 text-ui-label tracking-normal ${
                tab === t ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-600'
              }`}
            >
              {count}
            </span>
          </Link>
        ))}
        <span className="flex-1" />
        {tab !== 'mine' ? (
          <span className="flex items-center gap-2 text-ui-caption text-ink-500">
            Sort
            {(
              [
                ['fit', 'Best fit'],
                ['new', 'Newest'],
              ] as const
            ).map(([s, label]) => (
              <Link
                key={s}
                href={buildHref({ tab, sort: s, cat })}
                className={`rounded-full px-3 py-1 ${
                  sort === s ? 'bg-ink-100 font-semibold text-ink-900' : 'hover:text-ink-900'
                }`}
              >
                {label}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {/* Category chips */}
      {tab !== 'mine' && cats.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref({ tab, sort })}
            className={`rounded-full border px-3 py-1 text-ui-caption ${
              !cat ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-200 bg-white text-ink-500'
            }`}
          >
            All categories
          </Link>
          {cats.map((c) => (
            <Link
              key={c}
              href={buildHref({ tab, sort, cat: c })}
              className={`rounded-full border px-3 py-1 text-ui-caption ${
                cat === c ? 'border-pink-500 bg-pink-500 text-white' : 'border-ink-200 bg-white text-ink-500'
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Lists */}
      {tab === 'mine' ? (
        myInterests.length === 0 ? (
          <EmptyState emoji="📭" title="No interests yet">
            Express interest on a matched brief and it appears here with its status.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {myInterests.map((m) => {
              const pill = INTEREST_PILL[m.status] ?? INTEREST_PILL.SUBMITTED!
              const n = nicheBySlug.get(m.nicheSlug)
              return (
                <div key={m.id} className="rounded-3xl border border-ink-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div>
                      <h3 className="font-display text-ui-subhead">{m.briefTitle}</h3>
                      <p className="text-ui-caption text-ink-500">
                        {n ? `${n.iconEmoji ?? ''} ${n.name}` : m.nicheSlug} · sent{' '}
                        {postedAgo(m.createdAt)}
                      </p>
                    </div>
                    <span className={`ml-auto rounded-full border px-3 py-1 text-ui-caption font-medium ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <Term label="Your price" value={m.priceLow ? `$${m.priceLow}${m.priceHigh ? `–${m.priceHigh}` : ''}` : '—'} />
                    <Term label="Your MOQ" value={m.moq?.toLocaleString() ?? '—'} />
                    <Term label="Your lead" value={m.leadTimeWeeks ? `${m.leadTimeWeeks} wk` : '—'} />
                    <Term label="Paid sample" value={m.offersSample ? '✓ Yes' : '—'} />
                  </dl>
                  <p className="mt-3 text-ui-caption text-ink-500">Your note: {m.pitch || '—'}</p>
                  {m.status === 'SUBMITTED' || m.status === 'SHORTLISTED' ? (
                    <div className="mt-3 flex justify-end">
                      <WithdrawInterestButton interestId={m.id} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      ) : !facts.hasCapabilitySignal ? (
        <EmptyState emoji="🧭" title="No capability signal yet">
          Matching works off your published products — publish at least one product on a
          manufacturing service and briefs in those niches will surface here.
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState emoji="🔍" title="No briefs match this filter">
          New briefs from creators in your niches will appear here as they post.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {list.map((e) => {
            const n = nicheBySlug.get(e.brief.nicheSlug)
            const highFit = e.fitScore >= 80
            return (
              <div key={e.brief.id} className="rounded-xl border border-ink-200 bg-white p-s-4 shadow-sm">
                <div className="flex items-start gap-s-3">
                  {/* Demo .lg2 — niche-gradient product tile */}
                  <span
                    aria-hidden
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ui-section"
                    style={{ background: productGradient[nicheGradientKey(e.brief.nicheSlug)] }}
                  >
                    {n?.iconEmoji ?? '🧪'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-ui-section">{e.brief.title}</h3>
                    <p className="mt-s-1 text-ui-caption text-ink-500">
                      {e.brief.creator?.displayName ?? 'Creator'}
                      {e.brief.creator?.handle ? ` · ${e.brief.creator.handle}` : ''} ·{' '}
                      {n ? `${n.iconEmoji ?? ''} ${n.name}` : e.brief.nicheSlug} · posted{' '}
                      {postedAgo(e.brief.createdAt)}
                    </p>
                  </div>
                  {/* Demo .fit — meter with bar (success ≥80, warning below) */}
                  <div className="flex flex-none flex-col items-center">
                    <div className={`font-display text-ui-section ${highFit ? 'text-success-700' : 'text-warning-500'}`}>
                      {e.fitScore}%
                    </div>
                    <div className="text-ui-label uppercase text-ink-400">fit</div>
                    <div className="mt-s-1 h-1 w-12 overflow-hidden rounded-pill bg-ink-100">
                      <div
                        className={`h-full ${highFit ? 'bg-success-500' : 'bg-warning-500'}`}
                        style={{ width: `${e.fitScore}%` }}
                      />
                    </div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <Term label="Volume" value={e.brief.targetVolume?.toLocaleString() ?? '—'} />
                  <Term
                    label="Budget/unit"
                    value={
                      e.brief.budgetLow || e.brief.budgetHigh
                        ? `$${e.brief.budgetLow ?? '?'}–${e.brief.budgetHigh ?? '?'}`
                        : '—'
                    }
                  />
                  <Term label="Timeline" value={e.brief.timelineWeeks ? `${e.brief.timelineWeeks} wk` : '—'} />
                  <Term label="Category" value={e.categoryName ?? '—'} small />
                </dl>
                {e.brief.claims.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.brief.claims.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-semibold text-pink-700"
                      >
                        ✓ {c}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex items-center gap-3">
                  {/* Demo .stack — anonymous interest avatars (identities stay private) */}
                  {e.interestedCount > 0 ? (
                    <span className="flex items-center gap-s-2 text-ui-caption text-ink-500">
                      <span className="flex">
                        {(['purple', 'pink', 'lime', 'sky'] as const)
                          .slice(0, Math.min(e.interestedCount, 4))
                          .map((g, i) => (
                            <span
                              key={g}
                              aria-hidden
                              className={`h-5 w-5 rounded-pill border-2 border-white ${i > 0 ? '-ml-1.5' : ''}`}
                              style={{ background: productGradient[g] }}
                            />
                          ))}
                      </span>
                      {e.interestedCount} interested
                    </span>
                  ) : (
                    <span className="text-ui-caption text-ink-500">Be first to raise your hand</span>
                  )}
                  <span className="flex-1" />
                  {e.mine && e.mine.status !== 'WITHDRAWN' ? (
                    <span
                      className={`rounded-full border px-3 py-1 text-ui-caption font-medium ${(INTEREST_PILL[e.mine.status] ?? INTEREST_PILL.SUBMITTED!).cls}`}
                    >
                      {(INTEREST_PILL[e.mine.status] ?? INTEREST_PILL.SUBMITTED!).label}
                    </span>
                  ) : (
                    <ExpressInterestDialog
                      briefId={e.brief.id}
                      briefTitle={e.brief.title}
                      creatorName={e.brief.creator?.displayName ?? 'the creator'}
                      claims={e.brief.claims}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </>
  )
}

function Term({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-s-3 py-s-1">
      <dt className="text-ui-label uppercase text-ink-500">{label}</dt>
      <dd className={`text-ui-value ${small ? 'text-ui-caption' : ''}`}>{value}</dd>
    </div>
  )
}

function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-white px-6 py-14 text-center">
      <div className="text-3xl">{emoji}</div>
      <p className="mt-2 font-display text-ui-subhead">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-ui-caption text-ink-500">{children}</p>
    </div>
  )
}
