// Notification Center — Feedback (docs/FEEDBACK_MODULE.md §3.6, Stage 4).
// Admin v2 surface: KPI strip + chips + two tables — one-click/account
// feedback responses (triage) and creator product reviews (moderation).

import Link from 'next/link'
import {
  MessageSquareHeart,
  ThumbsUp,
  ThumbsDown,
  Inbox,
  Ticket,
  Star,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { TriageButtons, ReviewModerationButtons } from './FeedbackRowActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Feedback — Admin' }

const PAGE_SIZE = 50
const SUBJECTS = ['DELIVERY', 'ORDER', 'SUPPORT_TICKET', 'PLATFORM', 'IDEA'] as const
const STATUSES = ['NEW', 'REVIEWED', 'ACTIONED', 'DISMISSED'] as const

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: LucideIcon; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">{label}</span>
        <Icon className={cn('h-4 w-4', tone ?? 'text-ink-400')} aria-hidden="true" />
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  )
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; status?: string; score?: string; view?: string; page?: string }>
}) {
  const { subject, status, score, view, page } = await searchParams
  const pageNum = Math.max(1, Number(page) || 1)
  const showReviews = view === 'reviews'
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // ---- KPIs (30d window) ----------------------------------------------------
  const [total30, up30, down30, newCount, ticketCount, promptsSent30, reviewCounts] =
    await Promise.all([
      prisma.feedbackResponse.count({ where: { createdAt: { gte: since30 } } }),
      prisma.feedbackResponse.count({ where: { createdAt: { gte: since30 }, score: 'UP', late: false } }),
      prisma.feedbackResponse.count({ where: { createdAt: { gte: since30 }, score: 'DOWN', late: false } }),
      prisma.feedbackResponse.count({ where: { status: 'NEW' } }),
      prisma.feedbackResponse.count({ where: { supportTicketId: { not: null }, createdAt: { gte: since30 } } }),
      prisma.emailDelivery.count({
        where: { status: 'SENT', detail: { startsWith: 'feedback-prompt:' }, occurredAt: { gte: since30 } },
      }),
      prisma.productReview.groupBy({ by: ['status'], _count: { _all: true } }),
    ])
  const csat = up30 + down30 > 0 ? Math.round((up30 / (up30 + down30)) * 100) : null
  const responseRate = promptsSent30 > 0 ? Math.round((total30 / promptsSent30) * 100) : null
  const flaggedReviews = reviewCounts.find((r) => r.status === 'FLAGGED')?._count._all ?? 0

  // ---- Rows -------------------------------------------------------------------
  const responseWhere = {
    ...(SUBJECTS.includes(subject as (typeof SUBJECTS)[number]) ? { subjectType: subject } : {}),
    ...(STATUSES.includes(status as (typeof STATUSES)[number]) ? { status: status as never } : {}),
    ...(score === 'UP' || score === 'DOWN' ? { score: score as never } : {}),
  }
  const [responses, responseTotal, reviews] = await Promise.all([
    showReviews
      ? []
      : prisma.feedbackResponse.findMany({
          where: responseWhere,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
    showReviews ? 0 : prisma.feedbackResponse.count({ where: responseWhere }),
    showReviews
      ? prisma.productReview.findMany({ orderBy: { createdAt: 'desc' }, take: PAGE_SIZE })
      : [],
  ])

  // Author emails (soft FKs) in one lookup.
  const userIds = [
    ...new Set([...responses.map((r) => r.userId).filter((x): x is string => !!x), ...reviews.map((r) => r.creatorUserId)]),
  ]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : []
  const emailById = new Map(users.map((u) => [u.id, u.email]))

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ subject, status, score, view, page: undefined, ...over })) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }
  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
      active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
    )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Notifications"
        title="Feedback"
        description="One-click votes, enriched comments, account feedback, and creator product reviews — triage what needs action. Thumbs-down with a comment can auto-open a support ticket."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Responses 30d" value={total30} icon={MessageSquareHeart} />
        <Kpi label="CSAT 30d" value={csat != null ? `${csat}%` : '—'} icon={ThumbsUp} tone={csat != null && csat < 80 ? 'text-danger-600' : 'text-ink-900'} />
        <Kpi label="Response rate" value={responseRate != null ? `${responseRate}%` : '—'} icon={ThumbsDown} />
        <Kpi label="Open (NEW)" value={newCount} icon={Inbox} tone={newCount > 0 ? 'text-pink-700' : undefined} />
        <Kpi label="Auto-tickets 30d" value={ticketCount} icon={Ticket} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/notifications-center/feedback${qs({ view: undefined })}`} className={chip(!showReviews)}>
          Responses
        </Link>
        <Link href={`/notifications-center/feedback${qs({ view: 'reviews', subject: undefined, status: undefined, score: undefined })}`} className={chip(showReviews)}>
          <Star className="mr-1 inline h-3 w-3" aria-hidden /> Reviews{flaggedReviews > 0 ? ` (${flaggedReviews} flagged)` : ''}
        </Link>
        {!showReviews && (
          <>
            <span className="mx-2 h-4 w-px bg-ink-200" aria-hidden="true" />
            {SUBJECTS.map((s) => (
              <Link key={s} href={`/notifications-center/feedback${qs({ subject: subject === s ? undefined : s })}`} className={chip(subject === s)}>
                {s.replace('_', ' ').toLowerCase()}
              </Link>
            ))}
            <span className="mx-2 h-4 w-px bg-ink-200" aria-hidden="true" />
            {STATUSES.map((s) => (
              <Link key={s} href={`/notifications-center/feedback${qs({ status: status === s ? undefined : s })}`} className={chip(status === s)}>
                {s.toLowerCase()}
              </Link>
            ))}
            <span className="mx-2 h-4 w-px bg-ink-200" aria-hidden="true" />
            {(['UP', 'DOWN'] as const).map((s) => (
              <Link key={s} href={`/notifications-center/feedback${qs({ score: score === s ? undefined : s })}`} className={chip(score === s)}>
                {s === 'UP' ? '👍' : '👎'}
              </Link>
            ))}
          </>
        )}
      </div>

      {!showReviews ? (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Who</th>
                <th className="px-4 py-2.5">Subject</th>
                <th className="px-4 py-2.5">Score</th>
                <th className="px-4 py-2.5">Comment / tags</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 align-top">
              {responses.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-500">No feedback yet.</td></tr>
              )}
              {responses.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-500">
                    {r.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {r.late && <span className="ml-1.5 rounded bg-ink-100 px-1 py-0.5 text-[10px] text-ink-500">late</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[12px] text-ink-900">{r.userId ? (emailById.get(r.userId) ?? r.userId.slice(-8)) : '—'}</span>
                    {r.role && <span className="ml-1.5 text-[10.5px] uppercase text-ink-400">{r.role}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-600">
                    {r.subjectType.toLowerCase()}
                    {r.subjectId && <span className="ml-1 font-mono text-[11px] text-ink-400">…{r.subjectId.slice(-8)}</span>}
                  </td>
                  <td className="px-4 py-2.5">{r.score === 'UP' ? '👍' : r.score === 'DOWN' ? '👎' : '—'}</td>
                  <td className="max-w-[340px] px-4 py-2.5">
                    {r.comment && <p className="line-clamp-2 text-ink-800">{r.comment}</p>}
                    {r.tags.length > 0 && <p className="mt-0.5 text-[11.5px] text-ink-500">{r.tags.join(' · ')}</p>}
                    {r.supportTicketId && (
                      <Link href={`/support/${r.supportTicketId}`} className="text-[11.5px] font-medium text-pink-700 hover:underline">
                        Ticket opened ›
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-medium', r.status === 'NEW' ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-600')}>
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <TriageButtons responseId={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Creator</th>
                <th className="px-4 py-2.5">Rating</th>
                <th className="px-4 py-2.5">Review</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 align-top">
              {reviews.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No reviews yet.</td></tr>
              )}
              {reviews.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-500">
                    {r.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-900">
                    {emailById.get(r.creatorUserId) ?? r.creatorUserId.slice(-8)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-pink-600" aria-label={`${r.rating} stars`}>
                    {'★'.repeat(r.rating)}
                    <span className="text-ink-200">{'★'.repeat(5 - r.rating)}</span>
                  </td>
                  <td className="max-w-[380px] px-4 py-2.5">
                    <p className="font-medium text-ink-900">{r.title}</p>
                    <p className="line-clamp-2 text-ink-600">{r.body}</p>
                    {r.photoAssetIds.length > 0 && (
                      <p className="mt-0.5 text-[11.5px] text-ink-400">{r.photoAssetIds.length} photo{r.photoAssetIds.length === 1 ? '' : 's'}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-medium', r.status === 'PUBLISHED' ? 'bg-ink-100 text-ink-600' : r.status === 'FLAGGED' ? 'bg-warning-50 text-warning-900' : 'bg-danger-50 text-danger-600')}>
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ReviewModerationButtons reviewId={r.id} status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showReviews && responseTotal > PAGE_SIZE && (
        <div className="flex justify-end gap-2 text-[12.5px]">
          {pageNum > 1 && <Link href={`/notifications-center/feedback${qs({ page: String(pageNum - 1) })}`} className={chip(false)}>← Prev</Link>}
          {pageNum * PAGE_SIZE < responseTotal && <Link href={`/notifications-center/feedback${qs({ page: String(pageNum + 1) })}`} className={chip(false)}>Next →</Link>}
        </div>
      )}
    </div>
  )
}
