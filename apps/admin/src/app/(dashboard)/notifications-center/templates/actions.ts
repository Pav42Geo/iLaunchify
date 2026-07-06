'use server'

// Notification Center — Templates admin actions (checklist D,
// docs/EMAIL_NOTIFICATION_CENTER.md "Admin surfaces"). Draft/publish model:
// saving edits a DRAFT; publishing snapshots the previous PUBLISHED version
// (rollback target) and flips the row live. Every mutation writes AuditLog.

import { prisma } from '@ilaunchify/db'
import type { NotificationEvent } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  resolveNotificationContent,
  samplePayloadForEvent,
  unknownTokens,
  getNotificationBranding,
  sendTransactionalEmail,
  isFeedbackPromptKey,
  feedbackPrompt,
  type NotificationTemplateOverride,
} from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

const CTA_MODES = new Set(['AUTO', 'CUSTOM', 'NONE'])

export interface TemplateDraftInput {
  event: NotificationEvent
  subjectOverride: string | null
  bodyMarkdown: string | null
  ctaMode: 'AUTO' | 'CUSTOM' | 'NONE'
  ctaLabelOverride: string | null
  /** FEEDBACK_PROMPTS key — one-click thumbs block on this event (Stage 4). */
  feedbackPrompt: string | null
  /** In-app P2 — coalescing window in minutes (0/null = off, max 1440). */
  coalesceWindowMinutes: number | null
}

function validateDraft(input: TemplateDraftInput): string | null {
  if (!CTA_MODES.has(input.ctaMode)) return 'Invalid CTA mode'
  if (input.feedbackPrompt && !isFeedbackPromptKey(input.feedbackPrompt)) {
    return 'Unknown feedback prompt'
  }
  if (input.ctaMode === 'CUSTOM' && !input.ctaLabelOverride?.trim()) {
    return 'Custom CTA needs a label'
  }
  for (const field of [input.subjectOverride, input.bodyMarkdown, input.ctaLabelOverride]) {
    if (field) {
      const bad = unknownTokens(field, input.event)
      if (bad.length > 0) return `Unknown token${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}`
    }
  }
  if ((input.subjectOverride?.length ?? 0) > 300) return 'Subject too long (300 max)'
  if ((input.bodyMarkdown?.length ?? 0) > 5000) return 'Body too long (5000 max)'
  if (input.coalesceWindowMinutes != null) {
    const w = input.coalesceWindowMinutes
    if (!Number.isInteger(w) || w < 0 || w > 1440) {
      return 'Coalescing window must be a whole number of minutes between 0 and 1440'
    }
  }
  return null
}

/** Save (upsert) the event's override as a DRAFT — never touches what's live. */
export async function saveTemplateDraft(input: TemplateDraftInput): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const error = validateDraft(input)
  if (error) return { ok: false, error }

  const data = {
    subjectOverride: input.subjectOverride?.trim() || null,
    bodyMarkdown: input.bodyMarkdown?.trim() || null,
    ctaMode: input.ctaMode,
    ctaLabelOverride: input.ctaLabelOverride?.trim() || null,
    feedbackPrompt: input.feedbackPrompt || null,
    // Cast-guard (in-app P2): column lands with the next db:push + db:generate.
    ...({ coalesceWindowMinutes: input.coalesceWindowMinutes || null } as unknown as Record<
      string,
      never
    >),
    status: 'DRAFT' as const,
    updatedById: admin.id,
  }
  const row = await prisma.notificationTemplate.upsert({
    where: { event: input.event },
    create: { event: input.event, ...data },
    update: data,
  })

  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: row.id,
    action: 'TEMPLATE_DRAFT_SAVED',
    payload: { event: input.event },
  })
  revalidatePath(`/notifications-center/templates/${input.event}`)
  revalidatePath('/notifications-center/templates')
  return { ok: true }
}

/** Publish the current row: snapshot it as a version, set status PUBLISHED. */
export async function publishTemplate(event: NotificationEvent): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const row = await prisma.notificationTemplate.findUnique({ where: { event } })
  if (!row) return { ok: false, error: 'Nothing to publish — save a draft first' }
  if (!row.subjectOverride && !row.bodyMarkdown && row.ctaMode === 'AUTO') {
    return { ok: false, error: 'The draft is empty — it would change nothing' }
  }

  const nextVersion = row.status === 'PUBLISHED' ? row.version + 1 : row.version
  await prisma.$transaction([
    prisma.notificationTemplateVersion.create({
      data: {
        templateId: row.id,
        event,
        version: nextVersion,
        subjectOverride: row.subjectOverride,
        bodyMarkdown: row.bodyMarkdown,
        ctaMode: row.ctaMode,
        ctaLabelOverride: row.ctaLabelOverride,
        publishedById: admin.id,
      },
    }),
    prisma.notificationTemplate.update({
      where: { id: row.id },
      data: { status: 'PUBLISHED', version: nextVersion, updatedById: admin.id },
    }),
  ])

  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: row.id,
    action: 'TEMPLATE_PUBLISHED',
    toValue: `v${nextVersion}`,
    payload: { event },
  })
  revalidatePath(`/notifications-center/templates/${event}`)
  revalidatePath('/notifications-center/templates')
  return { ok: true }
}

/** Roll back to a published snapshot (re-publishes that version's content). */
export async function rollbackTemplate(event: NotificationEvent, version: number): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const row = await prisma.notificationTemplate.findUnique({ where: { event } })
  if (!row) return { ok: false, error: 'No template row for this event' }
  const snap = await prisma.notificationTemplateVersion.findUnique({
    where: { templateId_version: { templateId: row.id, version } },
  })
  if (!snap) return { ok: false, error: `No snapshot v${version}` }

  await prisma.notificationTemplate.update({
    where: { id: row.id },
    data: {
      subjectOverride: snap.subjectOverride,
      bodyMarkdown: snap.bodyMarkdown,
      ctaMode: snap.ctaMode,
      ctaLabelOverride: snap.ctaLabelOverride,
      status: 'PUBLISHED',
      version: snap.version,
      updatedById: admin.id,
    },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: row.id,
    action: 'TEMPLATE_ROLLED_BACK',
    toValue: `v${version}`,
    payload: { event },
  })
  revalidatePath(`/notifications-center/templates/${event}`)
  revalidatePath('/notifications-center/templates')
  return { ok: true }
}

/** Revert to the code template: delete the override row entirely. */
export async function revertToCodeTemplate(event: NotificationEvent): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const row = await prisma.notificationTemplate.findUnique({ where: { event } })
  if (!row) return { ok: true }
  await prisma.notificationTemplate.delete({ where: { id: row.id } })
  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: row.id,
    action: 'TEMPLATE_REVERTED_TO_CODE',
    payload: { event },
  })
  revalidatePath(`/notifications-center/templates/${event}`)
  revalidatePath('/notifications-center/templates')
  return { ok: true }
}

/** Per-event EMAIL kill-switch (in-app rows unaffected). */
export async function setTemplateEnabled(event: NotificationEvent, enabled: boolean): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const row = await prisma.notificationTemplate.upsert({
    where: { event },
    create: { event, enabled, updatedById: admin.id },
    update: { enabled, updatedById: admin.id },
  })
  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: row.id,
    action: enabled ? 'TEMPLATE_EMAIL_ENABLED' : 'TEMPLATE_EMAIL_DISABLED',
    payload: { event },
  })
  revalidatePath(`/notifications-center/templates/${event}`)
  revalidatePath('/notifications-center/templates')
  return { ok: true }
}

export interface PreviewResult {
  subject: string
  html: string
  text: string
  inApp: { title: string; body: string }
}

/** Resolve a preview of UNSAVED editor state against the sample payload. */
export async function previewTemplate(input: TemplateDraftInput): Promise<
  { ok: true; preview: PreviewResult } | { ok: false; error: string }
> {
  await requireRole('ADMIN')
  const error = validateDraft(input)
  if (error) return { ok: false, error }
  const branding = await getNotificationBranding()
  const override: NotificationTemplateOverride = {
    event: input.event,
    enabled: true,
    subjectOverride: input.subjectOverride?.trim() || null,
    bodyMarkdown: input.bodyMarkdown?.trim() || null,
    ctaMode: input.ctaMode,
    ctaLabelOverride: input.ctaLabelOverride?.trim() || null,
    feedbackPrompt: input.feedbackPrompt || null,
    coalesceWindowMinutes: input.coalesceWindowMinutes ?? null,
    status: 'DRAFT',
    version: 0,
  }
  const c = resolveNotificationContent(input.event, samplePayloadForEvent(input.event), {
    templateOverride: override,
    branding,
    preview: true,
    audience: 'creator', // shows header links in preview when branding has them
    unsubscribeUrl: 'https://ilaunchify.example/unsubscribe?token=preview',
    // Sample feedback block — the real send builds signed links; the preview
    // just shows what the block looks like.
    feedback:
      input.feedbackPrompt && isFeedbackPromptKey(input.feedbackPrompt)
        ? {
            question: feedbackPrompt(input.feedbackPrompt).question,
            upUrl: 'https://ilaunchify.example/feedback?token=preview-up',
            downUrl: 'https://ilaunchify.example/feedback?token=preview-down',
          }
        : undefined,
  })
  return {
    ok: true,
    preview: { subject: c.subject, html: c.html, text: c.text, inApp: c.inApp },
  }
}

/** Send the current preview to the signed-in admin's own address. */
export async function testSendTemplate(input: TemplateDraftInput): Promise<Result> {
  const admin = await requireRole('ADMIN')
  const previewed = await previewTemplate(input)
  if (!previewed.ok) return previewed
  const sent = await sendTransactionalEmail({
    to: admin.email,
    subject: `[TEST] ${previewed.preview.subject}`,
    html: previewed.preview.html,
    text: previewed.preview.text,
  })
  if (!sent.sent) {
    return {
      ok: false,
      error:
        sent.reason === 'not-configured'
          ? 'Resend is not configured (AUTH_RESEND_KEY / AUTH_EMAIL_FROM)'
          : 'Send failed — check the server logs',
    }
  }
  await logAuditAs(admin, {
    entityType: 'NotificationTemplate',
    entityId: input.event,
    action: 'TEMPLATE_TEST_SENT',
    payload: { event: input.event, to: admin.email },
  })
  return { ok: true }
}
