'use server'

// Notification Center — Branding singleton actions (checklist D).
// One row (singletonKey "default") holds the global email chrome: header
// identity, accent/ink, footer text, unsubscribe/preferences copy + link,
// from-name, reply-to. Absent row = the LOCKED design-system defaults.

import { prisma, resolveLogoForPlacement, Prisma } from '@ilaunchify/db'
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
  /** Audience-aware header nav links (Amazon-style, ≤4 each) — Stage 4. */
  headerLinks: Partial<Record<'creator' | 'partner' | 'admin', Array<{ label: string; url: string }>>> | null
}

function validateHeaderLinks(links: BrandingInput['headerLinks']): string | null {
  if (!links) return null
  for (const [audience, rows] of Object.entries(links)) {
    if (!rows) continue
    if (rows.length > 4) return `Max 4 header links per audience (${audience})`
    for (const l of rows) {
      if (!l.label.trim() || l.label.length > 30) return `Header link labels must be 1–30 chars (${audience})`
      if (!/^https?:\/\//.test(l.url)) return `Header link URLs must be absolute (${audience}: "${l.label}")`
    }
  }
  return null
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
  const linkError = validateHeaderLinks(input.headerLinks)
  if (linkError) return { ok: false, error: linkError }

  // Drop empty rows/audiences; null when nothing remains.
  const cleanedLinks = input.headerLinks
    ? Object.fromEntries(
        Object.entries(input.headerLinks)
          .map(([a, rows]) => [a, (rows ?? []).filter((l) => l.label.trim() && l.url.trim())])
          .filter(([, rows]) => (rows as unknown[]).length > 0),
      )
    : null

  const data = {
    headerLinks:
      cleanedLinks && Object.keys(cleanedLinks).length > 0
        ? (cleanedLinks as Prisma.InputJsonValue)
        : Prisma.JsonNull,
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

// The in-app sound actions moved to ../in-app/actions.ts (Pavel 2026-07-06 —
// the in-app channel got its own control page; this file is email chrome only).

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
      audience: 'creator', // header links preview from the creator set
    }),
  }
}
