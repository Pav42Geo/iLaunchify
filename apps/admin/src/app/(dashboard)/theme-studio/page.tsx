// =============================================================================
// Theme Studio (Admin) — Phase 3a: read-only live token catalog
// =============================================================================
//
// The admin control center for the platform design-token system (see
// THEME_MANAGEMENT_ARCHITECTURE.md). This first cut is READ-ONLY: it renders
// the live tokens (colors with WCAG contrast checks, the type ramp, the radius
// ramp) straight from the CSS variables + token modules, so admins can see the
// single source of truth. Editing + preview/publish with WCAG publish-gates is
// Phase 3b (needs the Theme/ThemeToken Prisma models).
//
// Cream-hero admin v2 surface pattern (LOCKED). platform:admin gated.

import type { ReactNode } from 'react'
import { requireCapability } from '@ilaunchify/auth'
import { EDITABLE_THEME_TOKENS, THEME_PAIRINGS, FONT_OPTIONS, getThemeOverrides } from '@ilaunchify/db'
import { pink, neon, ink, semantic, radii } from '@ilaunchify/ui/tokens'
import { ThemeEditor } from './ThemeEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Theme Studio — Admin' }

// -----------------------------------------------------------------------------
// WCAG 2.1 contrast helpers (SC 1.4.3 / 1.4.11). See ACCESSIBILITY_LEGAL_RESEARCH.md.
// -----------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function channelLum(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b)
}
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const WHITE = '#FFFFFF'
const INK = '#18181A'

/** AA = 4.5:1 normal text, AAA = 7:1. Returns a tone + label for a ratio chip. */
function ratioChip(ratio: number) {
  const r = Math.round(ratio * 100) / 100
  if (ratio >= 7) return { r, label: 'AAA', cls: 'bg-success-50 text-success-500 border-success-500/30' }
  if (ratio >= 4.5) return { r, label: 'AA', cls: 'bg-success-50 text-success-500 border-success-500/30' }
  if (ratio >= 3) return { r, label: 'AA Large', cls: 'bg-warning-50 text-warning-500 border-warning-500/30' }
  return { r, label: 'FAIL', cls: 'bg-danger-50 text-danger-500 border-danger-500/30' }
}

// -----------------------------------------------------------------------------
// Static ramp descriptors (the live values come from the CSS vars at render).
// -----------------------------------------------------------------------------

const TYPE_RAMP: { token: string; px: string; role: string }[] = [
  { token: '--fs-3xl', px: '30px', role: 'Page H1 (display)' },
  { token: '--fs-2xl', px: '24px', role: 'Section heading' },
  { token: '--fs-xl', px: '20px', role: 'KPI value' },
  { token: '--fs-lg', px: '16px', role: 'Card title / section title' },
  { token: '--fs-md', px: '14px', role: 'Body / buttons / inputs' },
  { token: '--fs-base', px: '13px', role: 'Default base' },
  { token: '--fs-sm', px: '12px', role: 'Chips / table' },
  { token: '--fs-xs', px: '11px', role: 'Labels' },
  { token: '--fs-2xs', px: '10px', role: 'Eyebrow / tiny' },
]

const RADIUS_RAMP: { token: string; value: string; role: string }[] = [
  { token: '--radius-xs', value: radii.xs, role: 'Nested badges' },
  { token: '--radius-sm', value: radii.sm, role: 'Small tags' },
  { token: '--radius-md', value: radii.md, role: 'Inputs / selects' },
  { token: '--radius-lg', value: radii.lg, role: 'Dialogs' },
  { token: '--radius-xl', value: radii.xl, role: 'Cards / menus' },
  { token: '--radius-pill', value: radii.pill, role: 'Buttons / chips' },
]

// -----------------------------------------------------------------------------
// Presentational atoms (server components)
// -----------------------------------------------------------------------------

function Swatch({ name, hex }: { name: string; hex: string }) {
  const onWhite = ratioChip(contrast(hex, WHITE))
  const onInk = ratioChip(contrast(hex, INK))
  return (
    <div className="rounded-[var(--radius-lg)] border border-ink-200 bg-white overflow-hidden">
      <div className="h-14 w-full" style={{ background: hex }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[length:var(--fs-sm)] font-semibold text-ink-900">{name}</span>
          <span className="font-mono text-[length:var(--fs-2xs)] uppercase text-ink-400">{hex}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className={`rounded-pill border px-1.5 py-0.5 text-[length:var(--fs-2xs)] font-semibold ${onWhite.cls}`}>
            on white {onWhite.r}
          </span>
          <span className={`rounded-pill border px-1.5 py-0.5 text-[length:var(--fs-2xs)] font-semibold ${onInk.cls}`}>
            on ink {onInk.r}
          </span>
        </div>
      </div>
    </div>
  )
}

function Ramp({ title, note, scale }: { title: string; note?: string; scale: Record<string | number, string> }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="font-display text-[length:var(--fs-lg)] font-semibold text-ink-900">{title}</h3>
        {note && <span className="text-[length:var(--fs-sm)] text-ink-500">{note}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(scale).map(([k, hex]) => (
          <Swatch key={k} name={`${title.toLowerCase().split(' ')[0]}-${k}`} hex={hex} />
        ))}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink-200 bg-white px-6 py-6">
      <h2 className="mb-5 font-display text-[length:var(--fs-xl)] font-bold tracking-tight text-ink-900">{title}</h2>
      <div className="space-y-7">{children}</div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default async function ThemeStudioPage() {
  await requireCapability('platform:admin')
  const overrides = await getThemeOverrides()

  const semanticFlat: Record<string, string> = {
    'success-50': semantic.success[50], 'success-500': semantic.success[500],
    'warning-50': semantic.warning[50], 'warning-500': semantic.warning[500],
    'danger-50': semantic.danger[50], 'danger-500': semantic.danger[500],
    'info-50': semantic.info[50], 'info-500': semantic.info[500],
  }

  return (
    <div className="space-y-6">
      {/* Cream hero (admin v2 LOCKED pattern) */}
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-6">
        <div className="flex items-center gap-2">
          <span className="rounded-pill border border-ink-300 bg-white px-2.5 py-0.5 text-[length:var(--fs-2xs)] font-semibold uppercase tracking-wide text-ink-600">
            Phase 3a · read-only
          </span>
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900">Theme Studio</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-600">
          The platform&apos;s single source of design truth — colors, type, and corners, read live from the CSS
          variables every app consumes. Editing with preview &amp; publish (gated by WCAG&nbsp;2.1&nbsp;AA contrast
          and target-size checks) lands in Phase&nbsp;3b. Contrast ratios below are computed against white and
          ink&nbsp;900; anything marked <span className="font-semibold text-danger-500">FAIL</span> must not carry text.
        </p>
      </div>

      <ThemeEditor tokens={EDITABLE_THEME_TOKENS} pairings={THEME_PAIRINGS} fontOptions={FONT_OPTIONS} current={overrides} />

      <Section title="Color">
        <Ramp title="Pink — brand" scale={pink} />
        <div className="rounded-[var(--radius-lg)] border border-warning-500/30 bg-warning-50 px-4 py-2.5 text-[length:var(--fs-sm)] text-warning-500">
          Neon green is a <strong>dark-surface-only</strong> token — it fails contrast on white (≈1.3:1). The chips below make that explicit.
        </div>
        <Ramp title="Neon — accent (dark only)" scale={neon} />
        <Ramp title="Ink — neutral" scale={ink} />
        <Ramp title="Semantic" scale={semanticFlat} />
      </Section>

      <Section title="Typography">
        <p className="text-[length:var(--fs-sm)] text-ink-500">
          rem-based ramp · one <code className="font-mono">--font-scale</code> knob resizes all of it (WCAG&nbsp;1.4.4).
        </p>
        <div className="space-y-3">
          {TYPE_RAMP.map((t) => (
            <div key={t.token} className="flex items-baseline gap-4 border-b border-ink-100 pb-3">
              <span className="w-28 shrink-0 font-mono text-[length:var(--fs-xs)] text-ink-500">{t.token}</span>
              <span className="w-12 shrink-0 font-mono text-[length:var(--fs-2xs)] text-ink-400">{t.px}</span>
              <span className="truncate text-ink-900" style={{ fontSize: `var(${t.token})` }}>
                The quick brown fox
              </span>
              <span className="ml-auto hidden shrink-0 text-[length:var(--fs-xs)] text-ink-500 sm:block">{t.role}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Corners">
        <p className="text-[length:var(--fs-sm)] text-ink-500">
          Mirrors <code className="font-mono">radii.ts</code>; the Tailwind <code className="font-mono">rounded-*</code>{' '}
          utilities and <code className="font-mono">var(--radius-*)</code> read the same scale.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {RADIUS_RAMP.map((r) => (
            <div key={r.token} className="text-center">
              <div
                className="mx-auto h-16 w-16 border border-ink-300 bg-ink-100"
                style={{ borderRadius: `var(${r.token})` }}
              />
              <div className="mt-2 font-mono text-[length:var(--fs-xs)] text-ink-700">{r.token.replace('--radius-', '')}</div>
              <div className="font-mono text-[length:var(--fs-2xs)] text-ink-400">{r.value}</div>
              <div className="text-[length:var(--fs-2xs)] text-ink-500">{r.role}</div>
            </div>
          ))}
        </div>
      </Section>

      <p className="px-2 pb-2 text-[length:var(--fs-xs)] text-ink-400">
        Next (Phase 3b): <code className="font-mono">Theme</code> / <code className="font-mono">ThemeToken</code> models →
        editable values → preview → publish, with the WCAG contrast / focus-ring / target-size gates as hard publish blocks.
      </p>
    </div>
  )
}
