'use client'

// =============================================================================
// AI Create workspace — full-page top tabs (AI_PACKAGING_GENERATOR §8).
//
// Two top tabs: Create (the generator) and Library (This product / My library /
// Starter gallery). "Use as inspiration" in the library reloads a saved design's
// brief into Create for the CURRENT die-line and re-creates it — the cross-die-line
// path. The library is browse-only on the full page (no live canvas here), so
// "Use on canvas" only appears in the in-canvas drawer.
// =============================================================================

import * as React from 'react'
import { Sparkles, LibraryBig } from 'lucide-react'
import { deriveTemplateTargeting } from '@ilaunchify/ui'
import { AiCreatePanelClient } from './AiCreatePanelClient'
import { TemplateLibrary } from './TemplateLibrary'
import { getGenerationBrief } from './actions'
import type { AiCreatePanelProps } from './AiCreatePanel'
import type { LibraryItem, ShapeKey } from './library-types'

type Props = Omit<AiCreatePanelProps, 'onGenerate' | 'onEditInStudio' | 'onExport'> & {
  productId?: string
  productTemplateId?: string | null
}

export function AiCreateWorkspace(props: Props) {
  const [tab, setTab] = React.useState<'create' | 'library'>('create')
  const [initialBrief, setInitialBrief] = React.useState<AiCreatePanelProps['initialBrief']>(undefined)
  const [briefKey, setBriefKey] = React.useState(0)

  const productShapes = React.useMemo<ShapeKey[]>(
    () =>
      props.dielines.map((d) => ({
        containerCategory: d.containerCategory ?? null,
        aspectBucket: deriveTemplateTargeting({ containerCategory: d.containerCategory ?? undefined, widthMm: d.surface.widthMm, heightMm: d.surface.heightMm }).aspectBucket,
      })),
    [props.dielines],
  )

  async function handleInspire(item: LibraryItem) {
    const brief = await getGenerationBrief(item.id).catch(() => null)
    if (brief) {
      setInitialBrief({ descriptor: brief.descriptor, styleTags: brief.styleTags, colorTags: brief.colorTags, elementTags: brief.elementTags })
      setBriefKey((k) => k + 1)
    }
    setTab('create')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <TopTab active={tab === 'create'} onClick={() => setTab('create')} icon={<Sparkles className="h-4 w-4" />}>
          Create
        </TopTab>
        <TopTab active={tab === 'library'} onClick={() => setTab('library')} icon={<LibraryBig className="h-4 w-4" />}>
          Library
        </TopTab>
      </div>

      {tab === 'create' ? (
        <AiCreatePanelClient key={briefKey} {...props} initialBrief={initialBrief} />
      ) : (
        <TemplateLibrary productTemplateId={props.productTemplateId ?? undefined} domain={props.domain} productShapes={productShapes} onUseAsInspiration={handleInspire} />
      )}
    </div>
  )
}

function TopTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${active ? 'bg-ink-900 text-white' : 'border border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}
    >
      {icon}
      {children}
    </button>
  )
}
