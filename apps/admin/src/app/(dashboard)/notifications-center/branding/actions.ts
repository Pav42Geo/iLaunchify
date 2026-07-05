'use server'

// Notification Center — Branding singleton actions (checklist D).
// One row (singletonKey "default") holds the global email chrome: header
// identity, accent/ink, footer text, unsubscribe/preferences copy + link,
// from-name, reply-to. Absent row = the LOCKED design-system defaults.

import { prisma, resolveLogoForPlacement } from '@ilaunchify/db'
import { requireRole } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import {
  DEFAULT_NOTIFICATION_BRANDING,
  renderEmailShell,
} from '@ilaunchify/notifications'
import { revalidatePath } from 'next/cache'

type Result = { ok: true } | { ok: false; error: string }

export interface BrandingInput {
  logoUrl: string | null
  brandName: string
  accentHex: string
  inkHex: string
  footerText: string | null
  unsubscribeText: string
  preferencesText: string
  preferenceCenterUrl: string | null
  fromName: string | null
  replyToEmail: string | null
}

const HEX = /^#[0-9a-fA-F]{6}$/

export async function saveBranding(input: BrandingInput): Promise<Result> {
  const admin = await requireRole('ADMIN')
  if (!input.brandName.trim()) return { ok: false, error: 'Brand name is required' }
  if (!HEX.test(input.accentHex)) return { ok: false, error: 'Accent must be a #RRGGBB hex' }
  if (!HEX.test(input.inkHex)) return { ok: false, error: 'Ink must be a #RRGGBB hex' }
  if (input.logoUrl && !/^https:\/\//.test(input.logoUrl)) {
    return { ok: false, error: 'Logo URL must be https' }
  }
  if (input.preferenceCenterUrl && !/^https?:\/\//.test(input.preferenceCenterUrl)) {
    return { ok: false, error: 'Preference center URL must be absolute' }
  }
  if (input.replyToEmail && !input.replyToEmail.includes('@')) {
    return { ok: false, error: 'Reply-to must be an email address' }
  }

  const data = {
    logoUrl: input.logoUrl?.trim() || null,
    brandName: input.brandName.trim(),
    accentHex: input.accentHex,
    inkHex: input.inkHex,
    footerText: input.footerText?.trim() || null,
    unsubscribeText: input.unsubscribeText.trim() || 'Unsubscribe from these emails',
    preferencesText: input.preferencesText.trim() || 'Manage your email preferences',
    preferenceCenterUrl: input.preferenceCenterUrl?.trim() || null,
    fromName: input.fromName?.trim() || null,
    replyToEmail: input.replyToEmail?.trim() || null,
    updatedById: admin.id,
  }

  const row = await prisma.notificationBranding.upsert({
    where: { singletonKey: 'default' },
    create: { singletonKey: 'default', ...data },
    update: data,
  })

  await logAuditAs(admin, {
    entityType: 'NotificationBranding',
    entityId: row.id,
    action: 'BRANDING_UPDATED',
    payload: { brandName: data.brandName, accentHex: data.accentHex },
  })
  revalidatePath('/notifications-center/branding')
  return { ok: true }
}

/** Render the shell preview for UNSAVED form state (same path as real sends). */
export async function previewBranding(input: BrandingInput): Promise<{ html: string }> {
  await requireRole('ADMIN')
  // Same logo precedence as the dispatcher: explicit URL → Theme Studio
  // 'emailHeader' placement → text header.
  const placementLogo = input.logoUrl
    ? null
    : await resolveLogoForPlacement('emailHeader', 'light')
        .then((r) => r.src)
        .catch(() => null)
  return {
    html: renderEmailShell({
      branding: {
        ...DEFAULT_NOTIFICATION_BRANDING,
        ...input,
        logoUrl: input.logoUrl ?? placementLogo,
      },
      subject: 'Acme Foods Co. accepted your manufacturer dispatch',
      bodySource:
        'Your order for **Daily Greens Powder** (#12345678) is one step closer to production.\n\nWe’ll keep you posted at every step.',
      cta: { label: 'View order', url: 'https://example.com/orders/1' },
      unsubscribeUrl: 'https://example.com/unsubscribe?token=preview',
    }),
  }
}
