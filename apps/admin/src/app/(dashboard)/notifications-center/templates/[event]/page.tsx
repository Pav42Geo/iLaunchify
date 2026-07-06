// Notification Center — per-event template editor (checklist D).
// Left: draft form (subject / body markdown-lite / CTA) with the event's
// click-to-insert token palette. Right: live preview (email / text / in-app)
// resolved against the sample payload. Publish snapshots a version; rollback
// re-publishes any snapshot; revert deletes the override (code template rules).

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import {
  EVENT_CATEGORY,
  NOTIFICATION_CATEGORIES,
  categoryForEvent,
  tokenPaletteForEvent,
  samplePayloadForEvent,
  resolveNotificationContent,
  getNotificationBranding,
} from '@ilaunchify/notifications'
import { AdminPageHeader } from '@/components/AdminPageHeader'
import { TemplateEditor } from './TemplateEditor'

export const dynamic = 'force-dynamic'

function isEvent(s: string): s is NotificationEvent {
  return Object.prototype.hasOwnProperty.call(EVENT_CATEGORY, s)
}

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ event: string }>
}) {
  const { event } = await params
  if (!isEvent(event)) notFound()

  const [row, branding] = await Promise.all([
    prisma.notificationTemplate.findUnique({
      where: { event },
      include: { versions: { orderBy: { version: 'desc' }, take: 10 } },
    }),
    getNotificationBranding(),
  ])

  const category = NOTIFICATION_CATEGORIES[categoryForEvent(event)]

  // Initial preview = what the resolver sends today (override if published,
  // else code template) on the sample payload.
  const initial = resolveNotificationContent(event, samplePayloadForEvent(event), {
    templateOverride: row
      ? {
          event,
          enabled: row.enabled,
          subjectOverride: row.subjectOverride,
          bodyMarkdown: row.bodyMarkdown,
          ctaMode: row.ctaMode,
          ctaLabelOverride: row.ctaLabelOverride,
          feedbackPrompt: row.feedbackPrompt,
          status: row.status,
          version: row.version,
        }
      : null,
    branding,
    preview: true,
    unsubscribeUrl: 'https://ilaunchify.example/unsubscribe?token=preview',
  })

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={`Notifications · ${category.label}`}
        title={event}
        description={`Category: ${category.label}${category.optOutable ? ' (opt-outable — footer carries the one-click unsubscribe)' : ' (mandatory — no unsubscribe link)'}. Tokens fill from the event's typed payload at send time.`}
        actions={
          <Link
            href="/notifications-center/templates"
            className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All templates
          </Link>
        }
      />

      <TemplateEditor
        event={event}
        tokens={[...tokenPaletteForEvent(event)]}
        row={
          row
            ? {
                enabled: row.enabled,
                subjectOverride: row.subjectOverride,
                bodyMarkdown: row.bodyMarkdown,
                ctaMode: row.ctaMode,
                ctaLabelOverride: row.ctaLabelOverride,
                status: row.status,
                version: row.version,
              }
            : null
        }
        versions={(row?.versions ?? []).map((v) => ({
          version: v.version,
          publishedAt: v.publishedAt.toISOString(),
        }))}
        initialPreview={{
          subject: initial.subject,
          html: initial.html,
          text: initial.text,
          inApp: { title: initial.inApp.title, body: initial.inApp.body },
        }}
      />
    </div>
  )
}
