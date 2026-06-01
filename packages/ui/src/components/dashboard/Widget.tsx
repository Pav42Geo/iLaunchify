// @ilaunchify/ui — Dashboard Widget shell.
//
// Server-component-friendly base for every dashboard tile across the admin,
// partner, and creator apps. Matches the v2 admin surface pattern
// (memory ilaunchify-admin-surface-pattern):
//   - White body inside `rounded-2xl border border-ink-200 overflow-hidden`.
//   - Cream `#F3EFE8` header band with title (font-display) + subtitle.
//   - Optional tinted icon ball (tone-driven, not a left-edge stripe).
//   - Optional cream footer band with a small pink-700 chevron link.
//   - Loading skeleton + error state are first-class.
//
// Variants build on top of this shell: KpiWidget, ChartWidget, ListWidget,
// QueueWidget, StatusWidget, TimelineWidget. Each accepts these base props
// + their own data prop.
//
// Span: snaps to a 12-col grid via a STATIC class map (Tailwind purge needs
// literal class names). Default span = 4.

import * as React from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type WidgetTone =
  | 'pink'
  | 'ink'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'neon'

export type WidgetSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface WidgetFooterLink {
  href: string
  label: string
}

export interface WidgetBaseProps {
  /** Title rendered in the cream header band. */
  title?: string
  /** Subtitle directly under the title. */
  subtitle?: string
  /** Semantic tone — drives the icon ball fill + footer-link accent. */
  tone?: WidgetTone
  /**
   * Icon rendered inside a tinted ball on the left of the header. Pass a
   * Lucide icon component OR any ReactNode. When a LucideIcon is passed it
   * renders sized 16×16 automatically.
   */
  icon?: React.ReactNode | LucideIcon
  /** Optional right-aligned slot in the header band (badges, counts, etc.). */
  headerSlot?: React.ReactNode
  /** Optional cream footer band with a pink-700 chevron link. */
  footerLink?: WidgetFooterLink
  /** Loading-state skeleton inside the body. */
  loading?: boolean
  /** Error message — renders rose icon + text in place of body. */
  error?: string
  /** Optional retry callback used when `error` is set. Renders as a button. */
  onRetry?: () => void
  /** 12-col grid span. Defaults to 4. */
  span?: WidgetSpan
  /** Extra classes merged onto the outer container. */
  className?: string
}

export interface WidgetProps extends WidgetBaseProps {
  children?: React.ReactNode
}

// -----------------------------------------------------------------------------
// Tone tables (icon ball + footer link accent)
// -----------------------------------------------------------------------------

const TONE_ICON_BALL: Record<WidgetTone, string> = {
  pink: 'bg-pink-100 text-pink-700',
  ink: 'bg-ink-100 text-ink-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  danger: 'bg-rose-100 text-rose-700',
  // Neon on light — neon-500 ball with ink-900 text (the only readable
  // combination, mirrors the locked Button neon variant).
  neon: 'bg-neon-500 text-ink-900',
}

const TONE_FOOTER_LINK: Record<WidgetTone, string> = {
  pink: 'text-pink-700 hover:text-pink-800',
  ink: 'text-ink-700 hover:text-ink-900',
  success: 'text-emerald-700 hover:text-emerald-800',
  warning: 'text-amber-700 hover:text-amber-800',
  info: 'text-sky-700 hover:text-sky-800',
  danger: 'text-rose-700 hover:text-rose-800',
  neon: 'text-ink-900 hover:text-black',
}

// Static span class map — Tailwind purge needs literal class names.
const SPAN_CLASSES: Record<WidgetSpan, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
  7: 'lg:col-span-7',
  8: 'lg:col-span-8',
  9: 'lg:col-span-9',
  10: 'lg:col-span-10',
  11: 'lg:col-span-11',
  12: 'lg:col-span-12',
}

// -----------------------------------------------------------------------------
// Helpers — render an `icon` prop that may be a LucideIcon component OR an
// already-rendered ReactNode.
// -----------------------------------------------------------------------------

function renderIcon(icon: WidgetBaseProps['icon']): React.ReactNode {
  if (!icon) return null
  // Already a rendered element or text node — pass through.
  if (React.isValidElement(icon) || typeof icon === 'string' || typeof icon === 'number') {
    return icon
  }
  // Otherwise it's a component TYPE: a plain function OR a forwardRef/memo
  // object. Lucide icons are forwardRef objects (typeof 'object'), so a
  // `typeof === 'function'` check misses them — leaving the raw component
  // object to be rendered as a child, which RSC can't serialize ("only plain
  // objects can be passed to Client Components").
  const Icon = icon as LucideIcon
  return <Icon className="h-4 w-4" aria-hidden="true" />
}

// -----------------------------------------------------------------------------
// WidgetHeader / WidgetBody / WidgetFooter — composable parts
// -----------------------------------------------------------------------------

export interface WidgetHeaderProps {
  title?: string
  subtitle?: string
  tone?: WidgetTone
  icon?: React.ReactNode | LucideIcon
  headerSlot?: React.ReactNode
  className?: string
}

export function WidgetHeader({
  title,
  subtitle,
  tone = 'ink',
  icon,
  headerSlot,
  className,
}: WidgetHeaderProps) {
  if (!title && !subtitle && !icon && !headerSlot) return null
  const iconNode = renderIcon(icon)
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-[#F3EFE8] px-5 py-3.5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {iconNode && (
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              TONE_ICON_BALL[tone],
            )}
          >
            {iconNode}
          </span>
        )}
        <div className="min-w-0">
          {title && (
            <h2 className="truncate font-display text-[15px] font-semibold leading-tight tracking-tight text-ink-900">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {headerSlot && <div className="shrink-0">{headerSlot}</div>}
    </header>
  )
}

export interface WidgetBodyProps {
  children?: React.ReactNode
  className?: string
}

export function WidgetBody({ children, className }: WidgetBodyProps) {
  return <div className={cn('bg-white p-4', className)}>{children}</div>
}

export interface WidgetFooterProps {
  link?: WidgetFooterLink
  tone?: WidgetTone
  className?: string
}

export function WidgetFooter({
  link,
  tone = 'ink',
  className,
}: WidgetFooterProps) {
  if (!link) return null
  return (
    <footer
      className={cn(
        'flex items-center justify-end border-t border-ink-100 bg-[#F3EFE8] px-5 py-2.5',
        className,
      )}
    >
      <Link
        href={link.href}
        className={cn(
          'inline-flex items-center gap-1 text-[12px] font-semibold',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:rounded',
          TONE_FOOTER_LINK[tone],
        )}
      >
        {link.label}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </footer>
  )
}

// -----------------------------------------------------------------------------
// Skeleton + Error states
// -----------------------------------------------------------------------------

function WidgetSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-live="polite">
      <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-ink-100" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
    </div>
  )
}

function WidgetError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-[12.5px] text-rose-900"
    >
      <AlertCircle
        className="mt-[1px] h-4 w-4 shrink-0 text-rose-600"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-0.5 text-rose-800">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'mt-2 inline-flex items-center gap-1 rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-rose-700',
              'transition-colors hover:bg-rose-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1',
            )}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Widget — outer shell that composes Header + Body + Footer.
// -----------------------------------------------------------------------------

export function Widget({
  title,
  subtitle,
  tone = 'ink',
  icon,
  headerSlot,
  footerLink,
  loading,
  error,
  onRetry,
  span = 4,
  className,
  children,
}: WidgetProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-ink-200 bg-white',
        SPAN_CLASSES[span],
        className,
      )}
    >
      <WidgetHeader
        title={title}
        subtitle={subtitle}
        tone={tone}
        icon={icon}
        headerSlot={headerSlot}
      />
      <WidgetBody>
        {error ? (
          <WidgetError message={error} onRetry={onRetry} />
        ) : loading ? (
          <WidgetSkeleton />
        ) : (
          children
        )}
      </WidgetBody>
      <WidgetFooter link={footerLink} tone={tone} />
    </section>
  )
}

// Re-export tone tables for variants (they reuse the same maps).
export const WIDGET_TONE_ICON_BALL = TONE_ICON_BALL
export const WIDGET_TONE_FOOTER_LINK = TONE_FOOTER_LINK
export const WIDGET_SPAN_CLASSES = SPAN_CLASSES
