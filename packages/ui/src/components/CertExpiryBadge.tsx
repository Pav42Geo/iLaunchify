import * as React from 'react'
import { cn } from '../lib/utils'
import {
  certExpiryTone,
  certExpiryLabel,
  CERT_EXPIRY_TONE_CLASS,
  CERT_EXPIRY_DOT_CLASS,
} from '../lib/certExpiry'

/**
 * CertExpiryBadge — color-coded days-until-expiry pill for a cert instance.
 *
 * green >90d · amber 30–90d · rose <30d · gray expired. Pure/presentational —
 * safe in RSC. Pass the instance `expiryDate`. Optionally inject `now` for
 * deterministic rendering/tests.
 */
export interface CertExpiryBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  expiryDate: Date | string
  now?: Date
  /** Hide the leading status dot. */
  hideDot?: boolean
}

export function CertExpiryBadge({
  expiryDate,
  now,
  hideDot = false,
  className,
  ...props
}: CertExpiryBadgeProps) {
  const tone = certExpiryTone(expiryDate, now)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap',
        CERT_EXPIRY_TONE_CLASS[tone],
        className,
      )}
      {...props}
    >
      {!hideDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', CERT_EXPIRY_DOT_CLASS[tone])} />
      )}
      {certExpiryLabel(expiryDate, now)}
    </span>
  )
}
