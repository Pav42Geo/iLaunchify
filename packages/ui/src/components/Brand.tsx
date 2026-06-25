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
  className,
  markClassName,
  wordmarkClassName,
  sublabelClassName,
}: {
  label?: string
  sublabel?: string
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  sublabelClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-[7px]', className)}>
      <span aria-hidden="true" className={cn('h-[26px] w-[26px] shrink-0 rounded-md bg-[var(--brand-mark-bg)]', markClassName)} />
      <span className={cn('font-display text-[length:var(--header-wordmark-fs)] font-extrabold tracking-[-0.04em] text-[var(--header-fg)]', wordmarkClassName)}>
        {label}
        {sublabel ? <span className={cn('ml-0.5 font-bold', sublabelClassName)}>{sublabel}</span> : null}
      </span>
    </span>
  )
}
