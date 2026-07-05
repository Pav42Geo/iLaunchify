// Branded, client-robust HTML (+ plaintext) shell for transactional emails.
//
// One shell renders every event: dispatcher passes the per-event title/body/link
// from renderTemplate() plus an event-appropriate CTA label. Table-based layout
// + inline styles (email clients strip <style>/flex/grid); a hidden preheader
// controls the inbox preview line. Pure functions — no I/O, node-verifiable.

const BRAND = {
  pink: '#FF2E63', // brand accent (design system, LOCKED 2026-05-27)
  ink: '#18181b',
  inkSoft: '#52525b',
  inkFaint: '#a1a1aa',
  hairline: '#e4e4e7',
  pageBg: '#f4f4f5',
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif",
}

/**
 * Optional NotificationBranding overrides (docs/EMAIL_NOTIFICATION_CENTER.md).
 * Callers with a branding row (one-off sends, digest) pass it here; absent
 * fields keep the LOCKED defaults so pre-Center behavior is unchanged. Event
 * emails go through resolveNotificationContent instead, which has the full
 * header/footer treatment.
 */
export interface EmailShellBranding {
  brandName?: string | null
  accentHex?: string | null
  inkHex?: string | null
  footerText?: string | null
}

export interface EmailContent {
  title: string
  body?: string
  /** Inbox preview line (hidden in the body). Falls back to body/title. */
  preheader?: string
  cta?: { label: string; url: string }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Full branded HTML email body. */
export function renderEmailHtml(c: EmailContent, branding?: EmailShellBranding): string {
  const brandName = branding?.brandName ?? 'iLaunchify'
  const accent = branding?.accentHex ?? BRAND.pink
  const ink = branding?.inkHex ?? BRAND.ink
  const preheader = (c.preheader ?? c.body ?? c.title).slice(0, 140)
  const button = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:999px;background:${ink}">
           <a href="${c.cta.url}" style="display:inline-block;padding:11px 22px;font-family:${BRAND.font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(c.cta.label)}</a>
         </td></tr>
       </table>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BRAND.pageBg}">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg}">
    <tr><td align="center" style="padding:28px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid ${BRAND.hairline};border-radius:14px;overflow:hidden">
        <tr><td style="height:4px;background:${accent}"></td></tr>
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 18px;font-family:${BRAND.font};font-size:15px;font-weight:800;letter-spacing:-0.01em;color:${ink}">${escapeHtml(brandName)}</p>
          <h1 style="margin:0 0 12px;font-family:${BRAND.font};font-size:19px;font-weight:600;line-height:1.35;color:${ink}">${escapeHtml(c.title)}</h1>
          ${c.body ? `<p style="margin:0 0 18px;font-family:${BRAND.font};font-size:14px;line-height:1.6;color:${BRAND.inkSoft}">${escapeHtml(c.body)}</p>` : ''}
          ${button}
        </td></tr>
        <tr><td style="padding:0 32px 26px">
          <hr style="border:none;border-top:1px solid ${BRAND.hairline};margin:6px 0 14px">
          <p style="margin:0;font-family:${BRAND.font};font-size:12px;line-height:1.5;color:${BRAND.inkFaint}">
            ${branding?.footerText ? `${escapeHtml(branding.footerText)}<br>` : ''}You're receiving this because email notifications are on for your ${escapeHtml(brandName)} account.
            Manage them anytime in your notification settings.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Plaintext alternative (multipart) — improves deliverability. */
export function renderEmailText(c: EmailContent): string {
  const lines = [c.title]
  if (c.body) lines.push('', c.body)
  if (c.cta) lines.push('', `${c.cta.label}: ${c.cta.url}`)
  lines.push(
    '',
    '—',
    "You're receiving this because email notifications are on for your iLaunchify account.",
    'Manage them in your notification settings.',
  )
  return lines.join('\n')
}

/**
 * Event-appropriate CTA label so emails don't all read "View in iLaunchify".
 * Keyed by event-name shape; unknown events get a sensible default.
 */
export function ctaLabelForEvent(event: string): string {
  if (event === 'PARTNER_ACTIVATED') return 'Go to dashboard'
  if (event === 'SUPPORT_REFUND_REQUESTED') return 'Review refund'
  if (event === 'ADMIN_CERT_EXPIRED_ON_PUBLISHED') return 'Open audit log'
  if (event.startsWith('SUPPORT_')) return 'Open ticket'
  if (event.startsWith('CERT_')) return 'Renew certificate'
  if (event === 'PARTNER_APPLIED' || event === 'PARTNER_SUBMITTED') return 'Review application'
  if (event === 'PACKAGING_APPROVED' || event === 'PACKAGING_REJECTED') return 'View packaging'
  if (event.startsWith('SECTION_')) return 'View application'
  if (event.startsWith('DISPATCH_')) return 'View dispatch'
  if (
    event.includes('ORDER') ||
    event.includes('DISPATCH') ||
    event.includes('CANCELLATION') ||
    event.includes('DISPUTE')
  ) {
    return 'View order'
  }
  return 'View in iLaunchify'
}
