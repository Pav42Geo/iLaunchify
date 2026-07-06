// Notification Center — In-app channel controls (Pavel 2026-07-06).
// The global knobs for the bell + feed channel: sound ping, auto-archive
// window, and pointers to the per-event coalescing windows (Templates) and
// the per-user preference matrix. Email chrome stays on Branding.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { getInAppSettings } from '@ilaunchify/notifications'
import { ArrowRight, Layers } from 'lucide-react'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { NotificationSoundCard } from './NotificationSoundCard'
import { InAppSettingsCard } from './InAppSettingsCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'In-app notifications — Admin' }

export default async function InAppNotificationsPage() {
  const [row, settings] = await Promise.all([
    prisma.notificationBranding.findUnique({ where: { singletonKey: 'default' } }),
    getInAppSettings(),
  ])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Notifications"
        title="In-app notifications"
        description="Global controls for the bell + feed channel across all three apps: the notification sound and feed hygiene. Per-event delivery (coalescing windows, copy) lives on each template; users pick their categories in their own settings."
      />

      <NotificationSoundCard
        initialEnabled={row?.soundEnabled ?? true}
        initialUrl={row?.soundUrl ?? null}
      />

      <InAppSettingsCard
        initialAutoArchiveDays={settings.autoArchiveDays}
        initialDigestEnabled={settings.digestEnabled}
      />

      <section className="rounded-2xl border border-ink-200 bg-white p-5">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-900">
          <Layers className="h-4 w-4 text-ink-500" /> Per-event controls
        </h2>
        <p className="mt-1 max-w-2xl text-[12.5px] text-ink-500">
          Coalescing windows (merge repeat notifications about the same order/dispatch/ticket
          into one row) are tuned per event on its template — delivery behavior lives next to
          the copy it affects.
        </p>
        <Link
          href="/notifications-center/templates"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-700 hover:border-ink-400"
        >
          Open Templates <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  )
}
