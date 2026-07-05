// resolveNotificationContent — the Center's pure composition engine
// (docs/EMAIL_NOTIFICATION_CENTER.md — "Resolution order at send time").
//
//   code template (fallback)  ──┐
//   PUBLISHED override (DB)   ──┼→ subject + body (+ CTA) → token substitution
//   branding singleton        ──┘→ global HEADER + body + global FOOTER
//
// Pure: no I/O, no env reads. The dispatcher fetches the override/branding rows
// (Phase 2) and passes them in; absent inputs reproduce today's behavior — the
// typed code template inside the current locked-brand shell.

import type { NotificationEvent } from '@ilaunchify/db'
import { renderTemplate, absoluteLink } from './templates'
import { ctaLabelForEvent, escapeHtml } from './email-html'
import { substituteTokens } from './template-tokens'
import { categoryForEvent, isCategoryOptOutable } from './categories'
import type {
  NotificationBrandingConfig,
  NotificationTemplateOverride,
} from './center-types'

// Matches the LOCKED design-system constants in email-html.ts (2026-05-27) —
// the no-branding-row default renders exactly today's chrome.
export const DEFAULT_NOTIFICATION_BRANDING: NotificationBrandingConfig = {
  logoUrl: null,
  brandName: 'iLaunchify',
  accentHex: '#FF2E63',
  inkHex: '#18181b',
  footerText: null,
  unsubscribeText: 'Unsubscribe from these emails',
  preferencesText: 'Manage your email preferences',
  preferenceCenterUrl: null,
  fromName: null,
  replyToEmail: null,
}

const SHELL = {
  inkSoft: '#52525b',
  inkFaint: '#a1a1aa',
  hairline: '#e4e4e7',
  pageBg: '#f4f4f5',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif",
}

export interface ResolveContentOptions {
  /** PUBLISHED per-event body override; DRAFT/absent → code template. */
  templateOverride?: NotificationTemplateOverride | null
  /** Global branding; merged over the locked defaults. */
  branding?: Partial<NotificationBrandingConfig> | null
  /** Picks the app host for relative CTA links (mirrors dispatcher logic). */
  audience?: 'admin' | 'partner' | 'creator'
  /** Absolute CTA url override (wins over the code template link). */
  ctaUrl?: string
  /**
   * Signed per-(user, category) unsubscribe link for the footer. Only rendered
   * when the event's category is opt-outable.
   */
  unsubscribeUrl?: string
  /**
   * Render a DRAFT override anyway (admin preview). Never set on real sends.
   */
  preview?: boolean
}

export interface ResolvedNotificationContent {
  subject: string
  html: string
  text: string
  /** Copy for the IN_APP row (markdown stripped; link stays app-relative). */
  inApp: { title: string; body: string; link?: string }
  /** The CTA that was rendered, if any. */
  cta?: { label: string; url: string }
}

/**
 * Markdown-lite → HTML. Escape FIRST (payload values can never inject markup),
 * then apply: **bold**, [label](https://url), blank-line paragraphs, single
 * newline → <br>.
 */
export function markdownLiteToHtml(src: string, pStyle: string): string {
  const escaped = escapeHtml(src)
  const inline = escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:inherit">$1</a>')
  return inline
    .split(/\n{2,}/)
    .map((p) => `<p style="${pStyle}">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Markdown-lite → plain text (for the text/plain part + IN_APP body). */
export function markdownLiteToText(src: string): string {
  return src
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
}

function overrideIsActive(o: NotificationTemplateOverride | null | undefined, preview: boolean) {
  if (!o) return false
  if (preview) return true
  return o.status === 'PUBLISHED'
}

export function resolveNotificationContent(
  event: NotificationEvent,
  payload: Record<string, unknown>,
  opts: ResolveContentOptions = {},
): ResolvedNotificationContent {
  const branding: NotificationBrandingConfig = {
    ...DEFAULT_NOTIFICATION_BRANDING,
    ...(opts.branding ?? {}),
  }
  const code = renderTemplate(event, payload as never)
  const override = overrideIsActive(opts.templateOverride, opts.preview ?? false)
    ? opts.templateOverride!
    : null

  // --- subject + body (override wins field-by-field; tokens substituted) ----
  const subject = override?.subjectOverride
    ? substituteTokens(override.subjectOverride, payload)
    : code.title
  const bodySource = override?.bodyMarkdown
    ? substituteTokens(override.bodyMarkdown, payload)
    : code.body
  const bodyText = markdownLiteToText(bodySource)

  // --- CTA -------------------------------------------------------------------
  const ctaMode = override?.ctaMode ?? 'AUTO'
  const ctaUrl =
    ctaMode === 'NONE'
      ? undefined
      : (opts.ctaUrl ??
        (code.link ? absoluteLink(code.link, opts.audience ?? 'partner') : undefined))
  const cta = ctaUrl
    ? {
        label:
          ctaMode === 'CUSTOM' && override?.ctaLabelOverride
            ? substituteTokens(override.ctaLabelOverride, payload)
            : ctaLabelForEvent(event),
        url: ctaUrl,
      }
    : undefined

  // --- footer links ----------------------------------------------------------
  const optOutable = isCategoryOptOutable(categoryForEvent(event))
  const unsubscribeUrl = optOutable ? opts.unsubscribeUrl : undefined

  const html = renderEmailShell({
    branding,
    subject,
    bodySource,
    cta,
    unsubscribeUrl,
  })

  const text = renderShellText({ branding, subject, bodyText, cta, unsubscribeUrl })

  return {
    subject,
    html,
    text,
    inApp: { title: subject, body: bodyText, link: code.link },
    cta,
  }
}

// ---------------------------------------------------------------------------
// Shell — global header + body + global footer (branding-parameterized twin of
// email-html.ts; exported for the admin Templates/Branding preview).
// ---------------------------------------------------------------------------

export function renderEmailShell(params: {
  branding: NotificationBrandingConfig
  subject: string
  /** Markdown-lite body (already token-substituted). */
  bodySource: string
  cta?: { label: string; url: string }
  unsubscribeUrl?: string
}): string {
  const b = params.branding
  const preheader = markdownLiteToText(params.bodySource || params.subject).slice(0, 140)
  const pStyle = `margin:0 0 18px;font-family:${SHELL.font};font-size:14px;line-height:1.6;color:${SHELL.inkSoft}`

  const headerBrand = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.brandName)}" height="24" style="display:block;height:24px;margin:0 0 18px">`
    : `<p style="margin:0 0 18px;font-family:${SHELL.font};font-size:15px;font-weight:800;letter-spacing:-0.01em;color:${b.inkHex}">${escapeHtml(b.brandName)}</p>`

  const button = params.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:999px;background:${b.inkHex}">
           <a href="${escapeHtml(params.cta.url)}" style="display:inline-block;padding:11px 22px;font-family:${SHELL.font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(params.cta.label)}</a>
         </td></tr>
       </table>`
    : ''

  const footerBits: string[] = []
  if (b.footerText) footerBits.push(escapeHtml(b.footerText))
  footerBits.push(
    "You're receiving this because email notifications are on for your " +
      `${escapeHtml(b.brandName)} account.`,
  )
  const footerLinks: string[] = []
  if (params.unsubscribeUrl) {
    footerLinks.push(
      `<a href="${escapeHtml(params.unsubscribeUrl)}" style="color:${SHELL.inkFaint}">${escapeHtml(b.unsubscribeText)}</a>`,
    )
  }
  if (b.preferenceCenterUrl) {
    footerLinks.push(
      `<a href="${escapeHtml(b.preferenceCenterUrl)}" style="color:${SHELL.inkFaint}">${escapeHtml(b.preferencesText)}</a>`,
    )
  }
  if (footerLinks.length) footerBits.push(footerLinks.join(' &nbsp;·&nbsp; '))

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${SHELL.pageBg}">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SHELL.pageBg}">
    <tr><td align="center" style="padding:28px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid ${SHELL.hairline};border-radius:14px;overflow:hidden">
        <tr><td style="height:4px;background:${b.accentHex}"></td></tr>
        <tr><td style="padding:28px 32px">
          ${headerBrand}
          <h1 style="margin:0 0 12px;font-family:${SHELL.font};font-size:19px;font-weight:600;line-height:1.35;color:${b.inkHex}">${escapeHtml(params.subject)}</h1>
          ${params.bodySource ? markdownLiteToHtml(params.bodySource, pStyle) : ''}
          ${button}
        </td></tr>
        <tr><td style="padding:0 32px 26px">
          <hr style="border:none;border-top:1px solid ${SHELL.hairline};margin:6px 0 14px">
          <p style="margin:0;font-family:${SHELL.font};font-size:12px;line-height:1.5;color:${SHELL.inkFaint}">
            ${footerBits.join('<br>')}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function renderShellText(params: {
  branding: NotificationBrandingConfig
  subject: string
  bodyText: string
  cta?: { label: string; url: string }
  unsubscribeUrl?: string
}): string {
  const b = params.branding
  const lines = [params.subject]
  if (params.bodyText) lines.push('', params.bodyText)
  if (params.cta) lines.push('', `${params.cta.label}: ${params.cta.url}`)
  lines.push(
    '',
    '—',
    ...(b.footerText ? [b.footerText] : []),
    `You're receiving this because email notifications are on for your ${b.brandName} account.`,
  )
  if (params.unsubscribeUrl) lines.push(`${b.unsubscribeText}: ${params.unsubscribeUrl}`)
  if (b.preferenceCenterUrl) lines.push(`${b.preferencesText}: ${b.preferenceCenterUrl}`)
  return lines.join('\n')
}
