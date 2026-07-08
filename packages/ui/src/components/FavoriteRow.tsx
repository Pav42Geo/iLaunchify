'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '../lib/utils'
import { productGradient, type ProductGradient } from '../tokens/colors'

/**
 * FavoriteRow — the canonical Amazon-style favorites list row (docs/
 * FAVORITES_MANAGEMENT.md §11). Shared by the in-marketplace favorites page AND
 * the creator profile /favorites so both surfaces stay in sync. Presentational +
 * app-agnostic: the host passes data + client controls (Remove / Share / Note)
 * via slots. Links auto-switch to a plain <a> for absolute (cross-app) hrefs so
 * a Product favorite can open the dashboard from the marketplace.
 *
 * Trust signals (rating, manufacturer badge, certs, sample) apply to marketplace
 * ProductTemplates; a creator's own Product shows status/orders instead.
 */

function SmartLink({
  href,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  href: string
  className?: string
  children: React.ReactNode
  'aria-label'?: string
}) {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}

const GRADIENT_KEYS = Object.keys(productGradient) as ProductGradient[]
function stableGradient(seed: string): ProductGradient {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return GRADIENT_KEYS[Math.abs(h) % GRADIENT_KEYS.length]!
}
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface FavoriteRowCert {
  name: string
  iconUrl?: string | null
}
export interface FavoriteRowLink {
  label: string
  href: string
  icon?: React.ReactNode
}

export interface FavoriteRowProps {
  href: string
  title: string
  icon?: string
  imageUrl?: string
  metaLine?: string
  priceCents?: number
  priceSnapshotCents?: number
  savedLabel?: string
  kindTag?: { label: string; tone: 'template' | 'mine' }
  /** Private creator note (display). Editing is a control passed via `actions`. */
  note?: string
  /** Trust signal — Bayesian rating. */
  rating?: { mean: number | null; count: number }
  /** Earned manufacturer standing (Merit). */
  manufacturerBadge?: 'TRUSTED' | 'PREMIER' | null
  /** Verified certification badges. */
  certs?: FavoriteRowCert[]
  /** Number of flavors/variants. */
  flavorCount?: number
  /** Template offers samples. */
  sampleAvailable?: boolean
  /** Template no longer purchasable (paused / unpublished after saving). */
  unavailable?: boolean
  /** Secondary line when there's no price (own products). */
  secondaryNote?: string
  primaryAction?: FavoriteRowLink
  /** Extra link actions (Order sample, Open in Studio). */
  secondaryLinks?: FavoriteRowLink[]
  /** Client controls (Remove / Share / Add note). */
  actions?: React.ReactNode
  className?: string
}

function Chip({ children, tone = 'ink' }: { children: React.ReactNode; tone?: 'ink' | 'amber' | 'purple' }) {
  const tones = {
    ink: 'bg-ink-50 text-ink-600 border-ink-200',
    amber: 'bg-warning-100 text-warning-800 border-warning-200',
    purple: 'bg-[#EEEDFE] text-[#3C3489] border-[#CECBF6]',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function FavoriteRow({
  href,
  title,
  icon,
  imageUrl,
  metaLine,
  priceCents,
  priceSnapshotCents,
  savedLabel,
  kindTag,
  note,
  rating,
  manufacturerBadge,
  certs,
  flavorCount,
  sampleAvailable,
  unavailable,
  secondaryNote,
  primaryAction,
  secondaryLinks,
  actions,
  className,
}: FavoriteRowProps) {
  const dropped =
    typeof priceCents === 'number' &&
    typeof priceSnapshotCents === 'number' &&
    priceSnapshotCents > 0 &&
    priceCents < priceSnapshotCents
  const dropPct = dropped ? Math.round(((priceSnapshotCents! - priceCents!) / priceSnapshotCents!) * 100) : 0

  return (
    <article
      className={cn(
        'flex gap-4 rounded-xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300',
        unavailable && 'opacity-75',
        className,
      )}
    >
      <SmartLink
        href={href}
        aria-label={title}
        className="relative flex h-[104px] w-[104px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-[34px]"
            style={{ background: productGradient[stableGradient(title)] }}
            aria-hidden="true"
          >
            {icon ?? '📦'}
          </span>
        )}
      </SmartLink>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SmartLink href={href} className="truncate text-[15px] font-semibold text-ink-900 hover:text-pink-700">
            {title}
          </SmartLink>
          {kindTag && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                kindTag.tone === 'template' ? 'bg-info-100 text-info-700' : 'bg-pink-50 text-pink-700',
              )}
            >
              {kindTag.label}
            </span>
          )}
          {unavailable && (
            <span className="shrink-0 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger-700">
              Unavailable
            </span>
          )}
        </div>

        {metaLine && <div className="mt-0.5 truncate text-[12px] text-ink-500">{metaLine}</div>}

        {(rating || manufacturerBadge || (certs && certs.length > 0) || flavorCount || sampleAvailable) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {rating && rating.count > 0 && typeof rating.mean === 'number' && (
              <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-600">
                <span className="text-pink-600">★</span>
                <span className="font-medium text-ink-900">{rating.mean.toFixed(1)}</span>
                <span className="text-ink-400">({rating.count})</span>
              </span>
            )}
            {manufacturerBadge && (
              <Chip tone="purple">
                {manufacturerBadge === 'PREMIER' ? 'Premier maker' : 'Trusted maker'}
              </Chip>
            )}
            {(certs ?? []).slice(0, 3).map((c) =>
              c.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={c.name} src={c.iconUrl} alt={c.name} title={c.name} className="h-4 w-4 rounded-sm object-contain" />
              ) : (
                <Chip key={c.name}>{c.name}</Chip>
              ),
            )}
            {typeof flavorCount === 'number' && flavorCount > 1 && <Chip>{flavorCount} flavors</Chip>}
            {sampleAvailable && <Chip tone="amber">Sample available</Chip>}
          </div>
        )}

        {typeof priceCents === 'number' ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[16px] font-semibold text-ink-900">{money(priceCents)}</span>
            <span className="text-[12px] text-ink-500">/ unit</span>
            {dropped && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-medium text-success-800">
                ▼ dropped {dropPct}% · was {money(priceSnapshotCents!)} when saved
              </span>
            )}
          </div>
        ) : (
          secondaryNote && <div className="mt-1.5 text-[12px] text-ink-600">{secondaryNote}</div>
        )}

        {note && (
          <div className="mt-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px] italic text-ink-600">“{note}”</div>
        )}

        {savedLabel && <div className="mt-1.5 text-[11px] text-ink-400">{savedLabel}</div>}

        {(primaryAction || (secondaryLinks && secondaryLinks.length > 0) || actions) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {primaryAction && (
              <SmartLink
                href={primaryAction.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                {primaryAction.icon}
                {primaryAction.label}
              </SmartLink>
            )}
            {(secondaryLinks ?? []).map((l) => (
              <SmartLink
                key={l.label}
                href={l.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400"
              >
                {l.icon}
                {l.label}
              </SmartLink>
            ))}
            {actions}
          </div>
        )}
      </div>
    </article>
  )
}
