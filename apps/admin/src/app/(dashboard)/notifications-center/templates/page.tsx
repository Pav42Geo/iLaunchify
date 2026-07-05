// Notification Center — Templates (checklist D, docs/EMAIL_NOTIFICATION_CENTER.md).
// Admin v2 surface: hero band + KPI strip + category chips + sortable table.
// One row per NotificationEvent (the full typed catalog), overlaid with the
// DB override state: source (code default / customized), status, email on/off.

import Link from 'next/link'
import {
  Mail,
  LayoutTemplate,
  CheckCircle2,
  FileEdit,
  BellOff,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import {
  EVENT_CATEGORY,
  NOTIFICATION_CATEGORIES,
  categoryForEvent,
  renderTemplate,
  samplePayloadForEvent,
  type NotificationCategorySlug,
} from '@ilaunchify/notifications'
import { cn } from '@ilaunchify/ui'
import { AdminPageHeader } from '@/components/AdminPageHeader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email templates — Admin' }

const ALL_EVENTS = Object.keys(EVENT_CATEGORY) as NotificationEvent[]

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone?: string }) {
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

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; source?: string }>
}) {
  const { category, source } = await searchParams
  const overrides = await prisma.notificationTemplate.findMany()
  const byEvent = new Map(overrides.map((o) => [o.event, o]))

  const rows = ALL_EVENTS.map((event) => {
    const o = byEvent.get(event)
    const customized = !!o && (o.subjectOverride != null || o.bodyMarkdown != null || o.ctaMode !== 'AUTO')
    return {
      event,
      category: categoryForEvent(event),
      // Code-template subject rendered on the sample payload = the live default.
      defaultSubject: renderTemplate(event, samplePayloadForEvent(event) as never).title,
      customized,
      status: o?.status ?? null,
      live: customized && o?.status === 'PUBLISHED',
      emailEnabled: o?.enabled ?? true,
      version: o?.version ?? null,
      updatedAt: o?.updatedAt ?? null,
    }
  })
    .filter((r) => !category || r.category === category)
    .filter((r) =>
      source === 'customized' ? r.customized : source === 'default' ? !r.customized : true,
    )

  const kpis = {
    total: ALL_EVENTS.length,
    customized: rows.filter((r) => r.customized).length,
    published: rows.filter((r) => r.live).length,
    drafts: rows.filter((r) => r.customized && r.status === 'DRAFT').length,
    disabled: rows.filter((r) => !r.emailEnabled).length,
  }

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
      active ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400',
    )

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { category, source, ...over }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Notifications"
        title="Email templates"
        description="Every platform notification, one row per event. Code templates are the default; publish an override to customize the subject, body, or CTA — the header and footer come from Branding."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Events" value={kpis.total} icon={LayoutTemplate} />
        <Kpi label="Customized" value={kpis.customized} icon={FileEdit} tone="text-pink-700" />
        <Kpi label="Published" value={kpis.published} icon={CheckCircle2} tone="text-ink-900" />
        <Kpi label="Drafts" value={kpis.drafts} icon={FileEdit} />
        <Kpi label="Email off" value={kpis.disabled} icon={BellOff} tone="text-danger-600" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/notifications-center/templates${qs({ category: undefined })}`} className={chip(!category)}>
          All categories
        </Link>
        {Object.values(NOTIFICATION_CATEGORIES).map((c) => (
          <Link
            key={c.slug}
            href={`/notifications-center/templates${qs({ category: c.slug })}`}
            className={chip(category === (c.slug as NotificationCategorySlug))}
          >
            {c.label}
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-ink-200" aria-hidden="true" />
        <Link href={`/notifications-center/templates${qs({ source: undefined })}`} className={chip(!source)}>
          All
        </Link>
        <Link href={`/notifications-center/templates${qs({ source: 'customized' })}`} className={chip(source === 'customized')}>
          Customized
        </Link>
        <Link href={`/notifications-center/templates${qs({ source: 'default' })}`} className={chip(source === 'default')}>
          Code default
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 bg-[var(--bg-hero)] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-ink-500">
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Subject (current)</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.event} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink-700">{r.event}</td>
                <td className="px-4 py-2.5 text-ink-600">{NOTIFICATION_CATEGORIES[r.category].label}</td>
                <td className="max-w-[320px] truncate px-4 py-2.5 text-ink-900">{r.defaultSubject}</td>
                <td className="px-4 py-2.5">
                  {r.customized ? (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10.5px] font-medium',
                        r.live ? 'bg-pink-50 text-pink-700' : 'bg-ink-100 text-ink-600',
                      )}
                    >
                      {r.live ? `Published v${r.version}` : 'Draft'}
                    </span>
                  ) : (
                    <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-500">
                      Code default
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {r.emailEnabled ? (
                    <Mail className="h-4 w-4 text-ink-400" aria-label="Email on" />
                  ) : (
                    <BellOff className="h-4 w-4 text-danger-600" aria-label="Email off" />
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/notifications-center/templates/${r.event}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-600 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                  >
                    Edit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
