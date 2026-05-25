'use client'

// StudioTabs — orchestrates the 7 tabs of Brand Identity Studio.
// Per docs/BRAND_IDENTITY_STUDIO.md + #165.
//
// V1 ships 4 deep tabs (Color / Typography / Voice / Taglines) and 3 stubs
// (Logo Suite / Imagery / Usage) that describe what's coming next so the
// destination feels intentional even before #166+ lands those features.

import { useState } from 'react'
import type { BrandArchetype } from '@prisma/client'
import {
  Palette,
  Type,
  MessageCircle,
  Quote,
  ImagePlus,
  Camera,
  BookOpen,
} from 'lucide-react'
import { ColorSystemTab } from './tabs/ColorSystemTab'
import { TypographyTab } from './tabs/TypographyTab'
import { VoiceToneTab } from './tabs/VoiceToneTab'
import { TaglinesTab } from './tabs/TaglinesTab'
import { LogoSuiteTab } from './tabs/LogoSuiteTab'
import { ImageryTab } from './tabs/ImageryTab'
import { UsageTab } from './tabs/UsageTab'

type TabKey = 'colors' | 'typography' | 'voice' | 'taglines' | 'logo' | 'imagery' | 'usage'

interface StudioTabsProps {
  brand: {
    id: string
    name: string
    tagline: string | null
    secondaryTaglines: string[]
    colorSystem: Record<string, string> | null
    colorPrimary: string | null
    colorSecondary: string | null
    colorAccent: string | null
    colorPaletteId: string | null
    customPaletteOverride: boolean
    typographyPairId: string | null
    typographyAccentId: string | null
    typeScaleRatio: number
    currentPairSummary: { name: string; heading: string; body: string } | null
    voiceArchetype: BrandArchetype | null
    voiceFormality: number | null
    voicePlayfulness: number | null
    voiceWarmth: number | null
    voiceNotes: string | null
    writingToneWords: string[]
    brandKeywords: string[]
    bannedWords: string[]
    personaDescription: string | null
  }
  palettes: Array<{
    id: string
    name: string
    description: string | null
    styleTags: string[]
    colorSystem: Record<string, string>
  }>
  typographyPairs: Array<{
    id: string
    name: string
    description: string | null
    styleTags: string[]
    heading: string
    body: string
  }>
  accentFonts: Array<{ id: string; label: string }>
}

const TABS: Array<{
  key: TabKey
  label: string
  icon: typeof Palette
  status: 'live' | 'preview'
}> = [
  { key: 'colors', label: 'Color System', icon: Palette, status: 'live' },
  { key: 'typography', label: 'Typography', icon: Type, status: 'live' },
  { key: 'voice', label: 'Voice & Tone', icon: MessageCircle, status: 'live' },
  { key: 'taglines', label: 'Taglines', icon: Quote, status: 'live' },
  { key: 'logo', label: 'Logo Suite', icon: ImagePlus, status: 'preview' },
  { key: 'imagery', label: 'Imagery', icon: Camera, status: 'preview' },
  { key: 'usage', label: 'Usage Rules', icon: BookOpen, status: 'preview' },
]

export function StudioTabs({ brand, palettes, typographyPairs, accentFonts }: StudioTabsProps) {
  const [active, setActive] = useState<TabKey>('colors')

  return (
    <div className="space-y-6">
      {/* Tab strip */}
      <div
        className="flex flex-wrap gap-1 border-b border-zinc-200"
        role="tablist"
        aria-label="Brand identity sections"
      >
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.status === 'preview' && (
                <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                  Preview
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      <div role="tabpanel" className="rounded-lg border border-zinc-200 bg-white p-5 sm:p-6">
        {active === 'colors' && (
          <ColorSystemTab
            brandId={brand.id}
            initial={(brand.colorSystem ?? {}) as Record<string, string>}
            palettes={palettes}
            selectedPaletteId={brand.colorPaletteId}
            customOverride={brand.customPaletteOverride}
          />
        )}
        {active === 'typography' && (
          <TypographyTab
            brandId={brand.id}
            pairs={typographyPairs}
            accentFonts={accentFonts}
            selectedPairId={brand.typographyPairId}
            selectedAccentId={brand.typographyAccentId}
            currentRatio={brand.typeScaleRatio}
            currentPairSummary={brand.currentPairSummary}
          />
        )}
        {active === 'voice' && (
          <VoiceToneTab
            brandId={brand.id}
            initial={{
              archetype: brand.voiceArchetype,
              formality: brand.voiceFormality,
              playfulness: brand.voicePlayfulness,
              warmth: brand.voiceWarmth,
              notes: brand.voiceNotes,
              writingToneWords: brand.writingToneWords,
              brandKeywords: brand.brandKeywords,
              bannedWords: brand.bannedWords,
              personaDescription: brand.personaDescription,
            }}
          />
        )}
        {active === 'taglines' && (
          <TaglinesTab
            brandId={brand.id}
            initial={{
              tagline: brand.tagline,
              secondaryTaglines: brand.secondaryTaglines,
            }}
          />
        )}
        {active === 'logo' && <LogoSuiteTab brandId={brand.id} brandName={brand.name} />}
        {active === 'imagery' && <ImageryTab brandId={brand.id} />}
        {active === 'usage' && <UsageTab brandId={brand.id} brandName={brand.name} />}
      </div>
    </div>
  )
}
