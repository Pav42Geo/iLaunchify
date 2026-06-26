// Certificate expiry surfacing — shared, pure (no React, import-safe in RSC,
// server actions, and cron workers). Drives the color-coded days-until-expiry
// indicator across the partner picker, attached cards, and admin cert library.
//
// Buckets (Certificates C4):
//   ok      green   > 90 days out
//   soon    amber   30–90 days out
//   urgent  rose    < 30 days out (incl. expires today)
//   expired gray    past expiry

export type CertExpiryTone = 'ok' | 'soon' | 'urgent' | 'expired'

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Whole days until expiry. Negative once expired. `now` injectable for tests. */
export function daysUntilExpiry(expiry: Date | string, now: Date = new Date()): number {
  const exp = typeof expiry === 'string' ? new Date(expiry) : expiry
  return Math.ceil((exp.getTime() - now.getTime()) / MS_PER_DAY)
}

export function certExpiryTone(expiry: Date | string, now: Date = new Date()): CertExpiryTone {
  const days = daysUntilExpiry(expiry, now)
  if (days < 0) return 'expired'
  if (days < 30) return 'urgent'
  if (days <= 90) return 'soon'
  return 'ok'
}

/** Tailwind classes for a small pill, keyed by tone. */
export const CERT_EXPIRY_TONE_CLASS: Record<CertExpiryTone, string> = {
  ok: 'bg-success-50 text-success-700 border-success-200',
  soon: 'bg-warning-50 text-warning-800 border-warning-200',
  urgent: 'bg-danger-50 text-danger-700 border-danger-200',
  expired: 'bg-ink-100 text-ink-500 border-ink-200',
}

/** A dot color per tone (for chips that show a status dot rather than a pill). */
export const CERT_EXPIRY_DOT_CLASS: Record<CertExpiryTone, string> = {
  ok: 'bg-success-500',
  soon: 'bg-warning-500',
  urgent: 'bg-danger-500',
  expired: 'bg-ink-400',
}

/** Short human label, e.g. "Expires in 45d", "Expires today", "Expired 3d ago". */
export function certExpiryLabel(expiry: Date | string, now: Date = new Date()): string {
  const days = daysUntilExpiry(expiry, now)
  if (days < 0) {
    const ago = Math.abs(days)
    return `Expired ${ago}d ago`
  }
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days}d`
}
