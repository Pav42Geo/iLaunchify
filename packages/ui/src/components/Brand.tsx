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
        {/* 25px lockup height everywhere (Pavel 2026-07-12; was 26px). */}
        <img src={imageSrc} alt={label} className="h-[25px] w-auto shrink-0 object-contain" />
        {sublabel ? <span className={cn(SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-[7px]', className)}>
      <LayersGlyph className={cn('h-[25px] w-[25px]', markClassName)} />
      <span className={cn('font-display text-[length:var(--header-wordmark-fs)] font-extrabold tracking-[-0.04em] text-[var(--header-fg)]', wordmarkClassName)}>
        {label}
      </span>
      {sublabel ? <span className={cn('ml-0.5', SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
    </span>
  )
}

/**
 * LayersMark — the iLaunchify platform mark: a rounded tile (`--brand-mark-bg`,
 * themeable) with the white open stacked-layers glyph. Inline SVG so it stays
 * crisp at any size; the rect's own rounding stands in for `rounded-md`.
 */
export function LayersMark({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className={cn('shrink-0', className)} style={style}>
      <rect width="96" height="96" rx="24" fill="var(--brand-mark-bg)" />
      <path d="M48 20 L76 34 L48 48 L20 34 Z" fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20 48 L48 62 L76 48" fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20 62 L48 76 L76 62" fill="none" stroke="#fff" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/**
 * LayersGlyph — the mark WITHOUT the tile: pink (`--brand-mark-bg`) open
 * stacked-layers strokes on a transparent, tightly-cropped canvas. Used beside
 * the "iLaunchify" wordmark in the lockup (the tile reads as a heavy box next to
 * text). For icon-only / thumbnail spots use LayersMark (the pink tile) instead.
 */
export function LayersGlyph({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="14 14 68 68" aria-hidden="true" className={cn('shrink-0', className)} style={style}>
      <path d="M48 20 L76 34 L48 48 L20 34 Z" fill="none" stroke="var(--brand-mark-bg)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20 48 L48 62 L76 48" fill="none" stroke="var(--brand-mark-bg)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20 62 L48 76 L76 62" fill="none" stroke="var(--brand-mark-bg)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
        // No explicit src: the stacked-layers mark by default; an admin-uploaded
        // compact mark (--brand-mark-url) overlays on top when set (else `none`).
        <span className="relative shrink-0" style={{ height: size, width: size }}>
          <LayersMark className={cn('h-full w-full', markClassName)} />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-md bg-cover bg-center"
            style={{ backgroundImage: 'var(--brand-mark-url)' }}
          />
        </span>
      )}
      {sublabel ? <span className={cn(SUBLABEL_CLASS, sublabelClassName)}>{sublabel}</span> : null}
    </span>
  )
}
