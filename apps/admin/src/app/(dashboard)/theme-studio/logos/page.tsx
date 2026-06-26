// =============================================================================
// Theme Studio › Logos (Admin) — Phase D platform logo manager.
// =============================================================================
// Four slots: the full lockup and the compact mark, each in a light and a dark
// variant (so the right one shows on light surfaces vs. dark headers/hero/CTA).
// Files live in R2; a stable public URL is used when R2_PUBLIC_BASE_URL is set,
// otherwise we sign a short-lived read URL just for this preview.
//
// platform:admin gated.

import Link from 'next/link'
import { requireCapability } from '@ilaunchify/auth'
import { listPlatformLogos, getLogoPlacements, LOGO_KINDS, LOGO_VARIANTS, LOGO_PLACEMENTS, type LogoKind, type LogoVariant } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'
import { LogoSlot } from './LogoUploader'
import { PlacementEditor } from './PlacementEditor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Logos — Theme Studio' }

const SLOT_LABEL: Record<string, string> = {
  full: 'Full lockup',
  mark: 'Compact mark',
}
const SLOT_HINT: Record<string, string> = {
  full: 'Mark + wordmark — used in headers, the marketing footer, and emails.',
  mark: 'Square icon only — used in tight spaces, favicons, and avatars.',
}

export default async function ThemeStudioLogosPage() {
  await requireCapability('platform:admin')

  const rows = await listPlatformLogos()
  // Resolve a display URL per row (public first; else sign).
  const byKey = new Map<string, { url: string; mimeType: string }>()
  for (const r of rows) {
    const url = r.publicUrl ?? (await getSignedReadUrl(r.storageKey, { expiresInSeconds: 60 * 60 }).catch(() => null))
    if (url) byKey.set(`${r.kind}:${r.variant}`, { url, mimeType: r.mimeType })
  }

  const placements = await getLogoPlacements()
  const placementRows = LOGO_PLACEMENTS.map((p) => ({
    key: p.key,
    label: p.label,
    kind: placements[p.key]?.kind ?? 'full',
    sublabel: placements[p.key]?.sublabel ?? '',
  }))
  const fullUrl = byKey.get('full:light')?.url ?? null
  const markUrl = byKey.get('mark:light')?.url ?? null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-[var(--bg-hero)] px-7 py-4">
        <Link href="/theme-studio" className="text-[length:var(--fs-2xs)] font-semibold uppercase tracking-wide text-ink-500 hover:text-ink-800">
          ← Theme Studio
        </Link>
        <h1 className="mt-2 font-display text-xl font-bold leading-tight tracking-[-0.02em] text-ink-900">Logos</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-600">
          Upload the platform logo. Provide a <strong>light</strong> version (for light surfaces) and a <strong>dark</strong>{' '}
          version (for dark headers, the hero, and the CTA band) of each. PNG, JPG, WEBP, or SVG · max 4&nbsp;MB.
          Transparent PNG or SVG looks best.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {LOGO_KINDS.map((kind) => (
          <section key={kind} className="rounded-3xl border border-ink-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-ink-900">{SLOT_LABEL[kind]}</h2>
            <p className="mt-0.5 text-sm text-ink-600">{SLOT_HINT[kind]}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {LOGO_VARIANTS.map((variant) => {
                const current = byKey.get(`${kind}:${variant}`)
                return (
                  <LogoSlot
                    key={variant}
                    kind={kind as LogoKind}
                    variant={variant as LogoVariant}
                    currentUrl={current?.url ?? null}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Per-header placement */}
      <section className="rounded-3xl border border-ink-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Where each logo appears</h2>
        <p className="mt-0.5 max-w-3xl text-sm text-ink-600">
          For every header, choose the <strong>full lockup</strong> or the <strong>mark only</strong>, and set an optional
          sublabel (e.g. “Admin Mode”, “Business”). Leave the sublabel blank to show no text.
        </p>
        <div className="mt-4">
          <PlacementEditor rows={placementRows} fullUrl={fullUrl} markUrl={markUrl} />
        </div>
      </section>
    </div>
  )
}
