// Notification Center — Log (checklist D). Recipient audit: who got what,
// when, on which channel, and whether the email actually went out. Joins the
// Notification feed rows with their EmailDelivery lifecycle where present.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import type { NotificationChannel } from '@ilaunchify/db'
import { categoryForEvent, NOTIFICATION_CATEGORIES } from '@ilaunchify/notifications'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notification log — Admin' }

const PAGE_SIZE = 50
const CHANNELS: NotificationChannel[] = ['EMAIL', 'IN_APP']

export default async function NotificationLogPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; q?: string; page?: string }>
}) {
  const { channel, q, page } = await searchParams
  const pageNum = Math.max(1, Number(page) || 1)
  const channelFilter = CHANNELS.includes(channel as NotificationChannel)
    ? (channel as NotificationChannel)
    : undefined

  const where = {
    ...(channelFilter ? { channel: channelFilter } : {}),
    ...(q ? { user: { email: { contains: q, mode: 'insensitive' as const } } } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, role: true } } },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { channel, q, page: undefined, ...over }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
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
        title="Notification log"
        description="Every notification row, per recipient and channel. Email status distinguishes sent, digest-queued, quiet-hours-skipped, suppressed, and failed."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/notifications-center/log${qs({ channel: undefined })}`} className={chip(!channelFilter)}>
          All channels
        </Link>
        {CHANNELS.map((c) => (
          <Link key={c} href={`/notifications-center/log${qs({ channel: c })}`} className={chip(channelFilter === c)}>
            {c === 'IN_APP' ? 'In-app' : 'Email'}
          </Link>
        ))}
        <form className="ml-auto" action="/notifications-center/log" method="get">
          {channelFilter && <input type="hidden" name="channel" value={channelFilter} />}
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Filter by recipient email…"
            className="w-64 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12.5px] text-ink-900 placeholder:text-ink-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Recipient</th>
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Channel</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-500">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {rows.map((n) => {
              const cat = NOTIFICATION_CATEGORIES[categoryForEvent(n.event)]
              const digest = !!(n.payload as { digest?: boolean } | null)?.digest
              const emailStatus =
                n.channel !== 'EMAIL'
                  ? null
                  : n.emailError
                    ? n.emailError.startsWith('suppressed')
                      ? { label: 'Suppressed', cls: 'bg-danger-50 text-danger-600' }
                      : { label: 'Failed', cls: 'bg-danger-50 text-danger-600' }
                    : n.emailSentAt
                      ? { label: 'Sent', cls: 'bg-ink-100 text-ink-700' }
                      : digest
                        ? { label: 'Digest queue', cls: 'bg-ink-50 text-ink-500' }
                        : { label: 'Skipped (quiet hours / unconfigured)', cls: 'bg-ink-50 text-ink-500' }
              return (
                <tr key={n.id} className="hover:bg-ink-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-500">
                    {n.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[12px] text-ink-900">{n.user.email}</span>
                    <span className="ml-2 text-[11px] uppercase text-ink-400">{n.user.role}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-700">{n.event}</td>
                  <td className="px-4 py-2.5 text-ink-600">{cat.label}</td>
                  <td className="px-4 py-2.5 text-ink-600">{n.channel === 'IN_APP' ? 'In-app' : 'Email'}</td>
                  <td className="px-4 py-2.5">
                    {emailStatus ? (
                      <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-medium', emailStatus.cls)} title={n.emailError ?? undefined}>
                        {emailStatus.label}
                      </span>
                    ) : n.readAt ? (
                      <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-500">Read</span>
                    ) : (
                      <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-pink-700">Unread</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[12.5px] text-ink-500">
        <span>
          {total.toLocaleString()} rows · page {pageNum} of {totalPages}
        </span>
        <div className="flex gap-2">
          {pageNum > 1 && (
            <Link href={`/notifications-center/log${qs({ page: String(pageNum - 1) })}`} className={chip(false)}>
              ← Prev
            </Link>
          )}
          {pageNum < totalPages && (
            <Link href={`/notifications-center/log${qs({ page: String(pageNum + 1) })}`} className={chip(false)}>
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
