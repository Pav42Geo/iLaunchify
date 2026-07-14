// Panel kit — the shared presentational primitives of the partner settings-hub
// panels, 1:1 with design/partner-profile-prototype-v2.html (SCREEN: SETTINGS).
// Pavel 2026-07-12: every rail destination renders with these patterns.
//
// Presentational only (no 'use client', no server-only imports) so both server
// pages and client editors can compose them. Interactive controls (seg-radios,
// toggles, forms) stay in the owning page/client component.
//
// Patterns ↔ prototype classes:
//   PanelHeader  ↔ .panel-h        LRow      ↔ .lrow
//   Fieldset     ↔ .fieldset       KpiStrip  ↔ .kpi-strip
//   StPill       ↔ .st-pill        InfoBanner↔ .info-banner
//   PanelCard    ↔ .card.pad

import { cn } from '@ilaunchify/ui'

export function PanelHeader({
  title,
  desc,
  aside,
}: {
  title: string
  desc?: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[22px] font-bold tracking-[-0.01em] text-ink-900">
          {title}
        </h2>
        {desc && <p className="mt-[3px] text-[13.5px] text-ink-500">{desc}</p>}
      </div>
      {aside && <div className="ml-auto flex-none">{aside}</div>}
    </div>
  )
}

export function PanelCard({
  className,
  children,
  id,
}: {
  className?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <div id={id} className={cn('rounded-2xl border border-ink-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function Fieldset({
  icon,
  title,
  hint,
  className,
  children,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('mb-[18px] rounded-2xl border border-ink-200 p-5 last:mb-0', className)}>
      <div className="mb-4 flex items-center gap-2.5">
        {icon && (
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-pink-50 text-pink-700 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <h4 className="font-display text-[15px] font-bold text-ink-900">{title}</h4>
        {hint && <span className="ml-auto text-[11px] text-ink-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export type PillTone = 'ok' | 'warn' | 'info' | 'muted' | 'danger'

const PILL_TONES: Record<PillTone, string> = {
  ok: 'text-success-700 bg-success-50 border-success-100',
  warn: 'text-warning-700 bg-warning-50 border-warning-100',
  info: 'text-info-700 bg-info-50 border-info-100',
  muted: 'text-ink-600 bg-ink-100 border-ink-200',
  danger: 'text-danger-700 bg-danger-50 border-danger-100',
}

export function StPill({
  tone = 'muted',
  className,
  children,
}: {
  tone?: PillTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold [&>svg]:h-3 [&>svg]:w-3',
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** List row — icon chip · title/sub · right cluster (pills/buttons). */
export function LRow({
  icon,
  iconClassName,
  title,
  sub,
  right,
  className,
}: {
  icon?: React.ReactNode
  /** Tint override for the icon chip (default ink). E.g. 'bg-pink-50 text-pink-700'. */
  iconClassName?: string
  title: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-2.5 flex items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-[15px] transition-all last:mb-0 hover:border-ink-300 hover:shadow-sm',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-ink-50 text-ink-600 [&>svg]:h-[19px] [&>svg]:w-[19px]',
            iconClassName,
          )}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-ink-900">{title}</div>
        {sub && <div className="text-[12px] text-ink-500">{sub}</div>}
      </div>
      {right && <div className="ml-auto flex flex-none items-center gap-3">{right}</div>}
    </div>
  )
}

export function KpiStrip({
  items,
  className,
}: {
  items: { v: React.ReactNode; l: string; vClassName?: string }[]
  className?: string
}) {
  return (
    <div
      className={cn('mb-5 grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}
    >
      {items.map((k) => (
        <div key={k.l} className="rounded-xl border border-ink-200 px-4 py-3.5">
          <div className={cn('font-display text-[22px] font-bold text-ink-900', k.vClassName)}>
            {k.v}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-500">{k.l}</div>
        </div>
      ))}
    </div>
  )
}

export function InfoBanner({
  tone = 'info',
  icon,
  className,
  children,
}: {
  tone?: 'info' | 'ok' | 'warn'
  icon?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  const tones = {
    info: 'bg-info-50 border-info-100 text-info-700',
    ok: 'bg-success-50 border-success-100 text-success-700',
    warn: 'bg-warning-50 border-warning-100 text-warning-700',
  }
  return (
    <div
      className={cn(
        'mb-[18px] flex items-start gap-[11px] rounded-xl border px-[15px] py-[13px] text-[13px] [&>svg]:mt-px [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:flex-none',
        tones[tone],
        className,
      )}
    >
      {icon}
      <div>{children}</div>
    </div>
  )
}

/** Chip — .chip / .chip.pink from the prototype. */
export function Chip({ pink, children }: { pink?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-[5px] text-[12px] font-medium',
        pink ? 'border-pink-100 bg-pink-50 text-pink-700' : 'border-ink-200 bg-ink-50 text-ink-700',
      )}
    >
      {children}
    </span>
  )
}
