import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Brand — the platform logo lockup (Phase D). Renders the mark (themeable square,
 * `--brand-mark-bg`) + the wordmark (`--header-wordmark-fs` / `--header-fg`) with
 * an optional sub-brand label (e.g. "Business", "Design Studio", "Admin Mode").
 *
 * One component so every surface renders the logo consistently and the mark color
 * is controllable from Theme Studio. Surfaces with their own color (dark footer,
 * Business header) pass `wordmarkClassName` / `sublabelClassName` to override.
 *
 * (Image-logo upload + an admin-configurable lockup registry are the next slice;
 * this is the shared component they will plug into.)
 */
export function Brand({
  label = 'iLaunchify',
  sublabel,
  imageSrc,
  className,
  markClassName,
  wordmarkClassName,
  sublabelClassName,
}: {
  label?: string
  sublabel?: string
  imageSrc?: string | null
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  sublabelClassName?: string
}) {
  if (imageSrc) {
    return (
      <span className={cn('inline-flex items-center gap-[7px]', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt={label} className="h-[26px] w-auto shrink-0 object-contain" />
        {sublabel ? <span className={cn(SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-[7px]', className)}>
      <span aria-hidden="true" className={cn('h-[26px] w-[26px] shrink-0 rounded-md bg-[var(--brand-mark-bg)]', markClassName)} />
      <span className={cn('font-display text-[length:var(--header-wordmark-fs)] font-extrabold tracking-[-0.04em] text-[var(--header-fg)]', wordmarkClassName)}>
        {label}
      </span>
      {sublabel ? <span className={cn('ml-0.5', SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
    </span>
  )
}

// Sublabel ("Admin Mode", "Business", …) — its OWN font/size/color tokens, so it
// reads as a quieter tag, not a clone of the wordmark. Per-surface className still
// overrides (twMerge), e.g. the Business header's neon sublabel.
const SUBLABEL_CLASS =
  'font-[family-name:var(--brand-sublabel-font)] text-[length:var(--brand-sublabel-fs)] font-semibold text-[var(--brand-sublabel-color)]'

/**
 * BrandMark — the compact mark ONLY (no wordmark). Renders the admin-uploaded
 * compact-mark image when `imageSrc` is set, else the themeable pink square
 * (`--brand-mark-bg`). Optional `sublabel` renders text beside it (e.g. a Studio
 * name). Used where the full lockup is too wide — the Studios, tight chrome.
 */
export function BrandMark({
  imageSrc,
  sublabel,
  size = 26,
  className,
  markClassName,
  sublabelClassName,
}: {
  imageSrc?: string | null
  sublabel?: string | null
  size?: number
  className?: string
  markClassName?: string
  sublabelClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-[7px]', className)}>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="iLaunchify" className={cn('shrink-0 rounded-md object-contain', markClassName)} style={{ height: size, width: size }} />
      ) : (
        // No explicit src: show the uploaded mark via the --brand-mark-url CSS var
        // (layered over the pink square); falls back to the square when unset.
        <span
          aria-hidden="true"
          className={cn('shrink-0 rounded-md bg-[var(--brand-mark-bg)] bg-cover bg-center', markClassName)}
          style={{ height: size, width: size, backgroundImage: 'var(--brand-mark-url)' }}
        />
      )}
      {sublabel ? <span className={cn(SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
    </span>
  )
}
