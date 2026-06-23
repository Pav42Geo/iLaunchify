'use client'

// ElementsDrawer — Canva-style "Elements" panel (Pavel 2026-06-23).
//
// One menu that gathers every insertable: Photos & uploads, Graphics, Clipart,
// Background, Patterns, plus Components and Phrases (pulled in here from their
// own rail tools). Navigation mirrors Canva: an OVERVIEW of horizontal rails
// (shared ElementRail — slides left/right, prominent "See all"); "See all"
// drills into that group's full drawer with a back arrow. No accordion.

import * as React from 'react'
import { ChevronLeft, Upload, Brush } from 'lucide-react'
import {
  addImageFromUrl,
  addIconFromUrl,
  setCanvasBackground,
  setCanvasPatternBackground,
  PATTERN_TILES,
  patternTileDataUrl,
  ElementRail,
  type BrandCanvasAssets,
  type FabricCanvas,
} from '@ilaunchify/ui'
import { ImagesDrawer } from './ImagesDrawer'
import { GraphicsDrawer } from './GraphicsDrawer'
import { BackgroundDrawer } from './BackgroundDrawer'
import { PatternsDrawer } from './PatternsDrawer'
import { ICON_COLLECTIONS } from '../graphics-collections'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
  productId: string
}

type GroupKey = 'photos' | 'graphics' | 'clipart' | 'background' | 'patterns'

const TITLES: Record<GroupKey, string> = {
  photos: 'Photos & uploads',
  graphics: 'Graphics',
  clipart: 'Clipart',
  background: 'Background',
  patterns: 'Patterns',
}

const INK_HEX = '0F1116'
function iconSvgUrl(id: string, heightPx: number, colorHex = INK_HEX): string {
  const [prefix, name] = id.split(':')
  return `https://api.iconify.design/${prefix}/${name}.svg?height=${heightPx}&color=%23${colorHex}`
}

const STAPLE_BG = ['#FFFFFF', '#FAF7F0', '#0F1116', '#FF2E63', '#B5FF3D', '#FFE9F0', '#E8F5E1']

export function ElementsDrawer({ canvas, brandAssets, productId }: Props) {
  const [seeAll, setSeeAll] = React.useState<GroupKey | null>(null)

  // ---- Drill-in: a single group's full original drawer ----
  if (seeAll) {
    return (
      <div className="overflow-x-clip">
        <button
          type="button"
          onClick={() => setSeeAll(null)}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-600 hover:text-ink-900"
        >
          <ChevronLeft className="h-4 w-4" /> All elements
        </button>
        <div className="mb-3 text-[15px] font-semibold text-ink-900">{TITLES[seeAll]}</div>
        {seeAll === 'photos' && (
          <ImagesDrawer canvas={canvas} brandAssets={brandAssets} productId={productId} />
        )}
        {seeAll === 'graphics' && <GraphicsDrawer canvas={canvas} />}
        {seeAll === 'background' && <BackgroundDrawer canvas={canvas} brandAssets={brandAssets} />}
        {seeAll === 'patterns' && <PatternsDrawer canvas={canvas} brandAssets={brandAssets} />}
        {seeAll === 'clipart' && <ClipartSoon />}
      </div>
    )
  }

  // ---- Overview: one horizontal rail per group ----
  const logos = brandAssets.logos.filter((l) => l.publicUrl)
  const brandImages = brandAssets.brandImages.filter((i) => i.url)
  const previewIcons = ICON_COLLECTIONS.flatMap((c) => c.icons).slice(0, 16)
  const brandSwatches = Array.from(
    new Set(
      [
        brandAssets.colorPrimary,
        brandAssets.colorSecondary,
        brandAssets.colorAccent,
        ...brandAssets.extraSwatches,
      ].filter((c): c is string => Boolean(c)),
    ),
  )
  const bgSwatches = Array.from(new Set([...brandSwatches, ...STAPLE_BG]))
  const patternColor = brandSwatches[0] ?? '#94908A'

  return (
    <div className="space-y-1 overflow-x-clip">
      {/* Photos & uploads */}
      <ElementRail label="Photos & uploads" onSeeAll={() => setSeeAll('photos')}>
        <ActionTile
          onClick={() => setSeeAll('photos')}
          className="border-dashed border-ink-300 bg-ink-50 text-ink-500 hover:border-pink-400 hover:text-pink-600"
        >
          <Upload className="h-4 w-4" />
          <span className="mt-1 text-[9px] font-semibold">Upload</span>
        </ActionTile>
        {logos.map((logo) => (
          <ImageTile
            key={logo.id}
            src={logo.publicUrl as string}
            alt={`${logo.variant} logo`}
            disabled={!canvas}
            onClick={() =>
              logo.publicUrl && addImageFromUrl(canvas!, logo.publicUrl, { maxFraction: 0.4 })
            }
          />
        ))}
        {brandImages.map((img) => (
          <ImageTile
            key={img.id}
            src={img.url as string}
            alt={img.label ?? 'Brand image'}
            disabled={!canvas}
            onClick={() => img.url && addImageFromUrl(canvas!, img.url, { maxFraction: 0.4 })}
          />
        ))}
        {logos.length === 0 && brandImages.length === 0 && (
          <EmptyHint>Pin brand photos from your library</EmptyHint>
        )}
      </ElementRail>

      {/* Graphics */}
      <ElementRail label="Graphics" onSeeAll={() => setSeeAll('graphics')}>
        {previewIcons.map((id) => (
          <ActionTile
            key={id}
            title={id}
            disabled={!canvas}
            onClick={() => canvas && addIconFromUrl(canvas, iconSvgUrl(id, 200), { sizePx: 96 })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSvgUrl(id, 40)} alt={id} loading="lazy" className="h-7 w-7 object-contain" />
          </ActionTile>
        ))}
      </ElementRail>

      {/* Clipart — not built yet */}
      <ElementRail label="Clipart" onSeeAll={() => setSeeAll('clipart')} seeAllLabel="Learn more">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex h-16 w-16 shrink-0 snap-start flex-col items-center justify-center rounded-md border border-dashed border-ink-200 bg-ink-50 text-ink-300"
          >
            <Brush className="h-4 w-4" />
            <span className="mt-1 text-[8px] font-semibold uppercase tracking-wider">Soon</span>
          </div>
        ))}
      </ElementRail>

      {/* Background */}
      <ElementRail label="Background" onSeeAll={() => setSeeAll('background')}>
        {bgSwatches.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            disabled={!canvas}
            onClick={() => canvas && setCanvasBackground(canvas, hex)}
            className="h-16 w-16 shrink-0 snap-start rounded-md border border-ink-200 transition-transform hover:scale-105 disabled:opacity-50"
            style={{ backgroundColor: hex }}
          >
            <span className="sr-only">Background {hex}</span>
          </button>
        ))}
      </ElementRail>

      {/* Patterns */}
      <ElementRail label="Patterns" onSeeAll={() => setSeeAll('patterns')}>
        {PATTERN_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            title={tile.label}
            disabled={!canvas}
            onClick={() => canvas && void setCanvasPatternBackground(canvas, tile.svg, patternColor)}
            className="h-16 w-16 shrink-0 snap-start rounded-md border border-ink-200 bg-white bg-repeat transition-transform hover:scale-105 disabled:opacity-50"
            style={{ backgroundImage: `url("${patternTileDataUrl(tile.svg, patternColor)}")` }}
          >
            <span className="sr-only">{tile.label}</span>
          </button>
        ))}
      </ElementRail>
    </div>
  )
}

// ============================================================================
// Tiles
// ============================================================================

function ActionTile({
  onClick,
  disabled,
  title,
  className = '',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'flex h-16 w-16 shrink-0 snap-start flex-col items-center justify-center rounded-md border border-ink-200 bg-white transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50 ' +
        className
      }
    >
      {children}
    </button>
  )
}

function ImageTile({
  src,
  alt,
  onClick,
  disabled,
}: {
  src: string
  alt: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative h-16 w-16 shrink-0 snap-start overflow-hidden rounded-md border border-ink-200 bg-white transition-all hover:border-pink-300 hover:shadow-sm disabled:opacity-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-1.5 h-[calc(100%-0.75rem)] w-[calc(100%-0.75rem)] object-contain" />
    </button>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-16 shrink-0 items-center rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 text-[11px] text-ink-500">
      {children}
    </div>
  )
}

function ClipartSoon() {
  return (
    <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-5 text-center">
      <Brush className="mx-auto h-5 w-5 text-ink-400" />
      <p className="mt-2 text-xs font-medium text-ink-700">Clipart library is coming soon</p>
      <p className="mt-0.5 text-[11px] text-ink-500">
        For now, search vector icons under Graphics.
      </p>
    </div>
  )
}
