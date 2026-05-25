// Brand Preview panel — live mirror of every Studio edit, applied to a
// faux product label + storefront card. Per #166 (Design Studio
// integration, slice 1).
//
// Server component on purpose — receives the brand row the parent page
// already loaded. Every save in actions.ts calls revalidatePath, so the
// preview updates one render later. No client-side state sync needed.

import type { BrandArchetype } from '@prisma/client'
import { Sparkles } from 'lucide-react'

interface BrandPreviewProps {
  brand: {
    name: string
    tagline: string | null
    colorSystem: Record<string, string> | null
    colorPrimary: string | null
    colorSecondary: string | null
    colorAccent: string | null
    voiceArchetype: BrandArchetype | null
    writingToneWords: string[]
    bannedWords: string[]
    personaDescription: string | null
    typographyPair: {
      headingFont: { family: string }
      bodyFont: { family: string }
    } | null
    typeScaleRatio: number
  }
}

// Defaults match ColorSystemTab so the preview never crashes even on a
// brand-new Brand row with nothing filled in.
const DEFAULT_COLORS = {
  primary: '#16a34a',
  secondary: '#475569',
  accent: '#f59e0b',
  surface: '#f8fafc',
  background: '#ffffff',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  border: '#e2e8f0',
}

export function BrandPreview({ brand }: BrandPreviewProps) {
  const cs = (brand.colorSystem ?? {}) as Record<string, string>
  const C = {
    primary: cs.primary ?? brand.colorPrimary ?? DEFAULT_COLORS.primary,
    secondary: cs.secondary ?? brand.colorSecondary ?? DEFAULT_COLORS.secondary,
    accent: cs.accent ?? brand.colorAccent ?? DEFAULT_COLORS.accent,
    surface: cs.surface ?? DEFAULT_COLORS.surface,
    background: cs.background ?? DEFAULT_COLORS.background,
    textPrimary: cs.textPrimary ?? DEFAULT_COLORS.textPrimary,
    textSecondary: cs.textSecondary ?? DEFAULT_COLORS.textSecondary,
    border: cs.border ?? DEFAULT_COLORS.border,
  }

  const headingFont = brand.typographyPair?.headingFont.family ?? 'Inter'
  const bodyFont = brand.typographyPair?.bodyFont.family ?? 'Inter'
  const ratio = brand.typeScaleRatio || 1.25
  const displaySize = 16 * Math.pow(ratio, 3)
  const headingSize = 16 * Math.pow(ratio, 2)

  // Tagline preview — fallback so the panel doesn't look broken pre-fill.
  const tagline = brand.tagline?.trim() || 'Your tagline lives here.'
  const archetypeLabel = brand.voiceArchetype
    ? ARCHETYPE_LABELS[brand.voiceArchetype]
    : 'Set a brand archetype →'

  return (
    <section
      className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
      aria-label="Brand preview"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
        <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
          Live preview
        </span>
        <span className="text-xs text-zinc-500">— how {brand.name} looks today</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
        {/* Left: faux product label / hero card */}
        <div
          className="p-6"
          style={{ backgroundColor: C.background, color: C.textPrimary, fontFamily: `"${bodyFont}", system-ui, sans-serif` }}
        >
          <div
            className="overflow-hidden rounded-lg border"
            style={{ borderColor: C.border, backgroundColor: C.surface }}
          >
            {/* Hero band */}
            <div
              className="px-5 py-7"
              style={{ backgroundColor: C.primary, color: C.background }}
            >
              <div
                className="font-bold leading-tight tracking-tight"
                style={{ fontFamily: `"${headingFont}", system-ui, sans-serif`, fontSize: `${displaySize}px` }}
              >
                {brand.name}
              </div>
              <div
                className="mt-2 opacity-90"
                style={{ fontSize: 14 }}
              >
                {tagline}
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <div
                className="font-semibold"
                style={{ fontFamily: `"${headingFont}", system-ui, sans-serif`, fontSize: `${headingSize}px`, color: C.textPrimary }}
              >
                Product spotlight
              </div>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.textSecondary }}>
                Lorem ipsum body text rendered in your body font at your base size. This is the
                vibe customers feel before they read the actual copy.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className="inline-block rounded-full px-3 py-1 text-xs font-medium"
                  style={{ backgroundColor: C.accent, color: C.background }}
                >
                  Shop now
                </span>
                <span
                  className="inline-block rounded-full border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: C.secondary, color: C.secondary }}
                >
                  Learn more
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: voice + tone signal */}
        <div className="border-l border-zinc-200 bg-zinc-50/50 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Voice
          </div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{archetypeLabel}</div>

          {brand.writingToneWords.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Tone
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {brand.writingToneWords.map((w) => (
                  <span
                    key={w}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ backgroundColor: C.accent + '22', color: C.textPrimary }}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {brand.bannedWords.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Never use
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {brand.bannedWords.slice(0, 6).map((w) => (
                  <span
                    key={w}
                    className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 line-through decoration-red-400"
                  >
                    {w}
                  </span>
                ))}
                {brand.bannedWords.length > 6 && (
                  <span className="text-xs text-zinc-400">
                    +{brand.bannedWords.length - 6}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Type sample
            </div>
            <div
              className="mt-1 truncate text-zinc-700"
              style={{ fontFamily: `"${headingFont}", system-ui, sans-serif`, fontSize: 18, fontWeight: 600 }}
            >
              {headingFont}
            </div>
            <div
              className="truncate text-zinc-500"
              style={{ fontFamily: `"${bodyFont}", system-ui, sans-serif`, fontSize: 13 }}
            >
              {bodyFont}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const ARCHETYPE_LABELS: Record<BrandArchetype, string> = {
  HERO: 'Hero — courage & mastery',
  SAGE: 'Sage — wisdom & truth',
  CAREGIVER: 'Caregiver — service & nurture',
  EXPLORER: 'Explorer — freedom & discovery',
  CREATOR: 'Creator — imagination & craft',
  JESTER: 'Jester — fun & irreverence',
  EVERYMAN: 'Everyman — belonging & realism',
  INNOCENT: 'Innocent — purity & simplicity',
  LOVER: 'Lover — intimacy & beauty',
  MAGICIAN: 'Magician — transformation',
  OUTLAW: 'Outlaw — rebellion & freedom',
  RULER: 'Ruler — control & status',
}
