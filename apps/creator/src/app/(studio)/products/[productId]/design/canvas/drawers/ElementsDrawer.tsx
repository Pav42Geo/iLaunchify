'use client'

// ElementsDrawer — Canva-style "Elements" panel (Pavel 2026-06-23).
//
// Consolidates five formerly-separate rail tools — Images, Graphics, Clipart,
// Background, Patterns — into one menu, grouped the way Canva groups its
// Elements panel: a single scroll of labelled, collapsible sections. Each
// section reuses the original drawer component unchanged, so all upload /
// search / swatch logic is preserved; this is purely an information-architecture
// merge.
//
// Grouping:
//   - Photos & uploads  → ImagesDrawer   (brand logos + library + upload)
//   - Graphics          → GraphicsDrawer (Iconify vector search)
//   - Clipart           → coming soon (was a v1:false rail stub)
//   - Background        → BackgroundDrawer (brand swatches + staples + hex)
//   - Patterns          → PatternsDrawer (tileable fills)
//
// Default: the first group (Photos) is expanded; the rest start collapsed so
// the panel reads as a compact, scannable index — exactly the Canva pattern.

import * as React from 'react'
import {
  ChevronDown,
  ImagePlus,
  Sparkles,
  Brush,
  ImageDown,
  Grid3x3,
  type LucideIcon,
} from 'lucide-react'
import type { BrandCanvasAssets, FabricCanvas } from '@ilaunchify/ui'
import { ImagesDrawer } from './ImagesDrawer'
import { GraphicsDrawer } from './GraphicsDrawer'
import { BackgroundDrawer } from './BackgroundDrawer'
import { PatternsDrawer } from './PatternsDrawer'

interface Props {
  canvas: FabricCanvas | null
  brandAssets: BrandCanvasAssets
  productId: string
}

type GroupKey = 'photos' | 'graphics' | 'clipart' | 'background' | 'patterns'

export function ElementsDrawer({ canvas, brandAssets, productId }: Props) {
  // Canva lets several groups stay open at once; default just the first.
  const [open, setOpen] = React.useState<Record<GroupKey, boolean>>({
    photos: true,
    graphics: false,
    clipart: false,
    background: false,
    patterns: false,
  })

  const toggle = (key: GroupKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="divide-y divide-ink-200">
      <Group
        groupKey="photos"
        label="Photos & uploads"
        hint="Brand logos, your library, and uploads"
        icon={ImagePlus}
        open={open.photos}
        onToggle={toggle}
      >
        <ImagesDrawer canvas={canvas} brandAssets={brandAssets} productId={productId} />
      </Group>

      <Group
        groupKey="graphics"
        label="Graphics"
        hint="Thousands of open-source vector icons"
        icon={Sparkles}
        open={open.graphics}
        onToggle={toggle}
      >
        <GraphicsDrawer canvas={canvas} />
      </Group>

      <Group
        groupKey="clipart"
        label="Clipart"
        hint="Illustrated stickers — coming soon"
        icon={Brush}
        open={open.clipart}
        onToggle={toggle}
      >
        <div className="rounded-md border border-dashed border-ink-300 bg-ink-50 p-4 text-center">
          <Brush className="mx-auto h-4 w-4 text-ink-400" />
          <p className="mt-1.5 text-xs font-medium text-ink-700">
            Clipart library is coming soon
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500">
            For now, search vector icons under Graphics.
          </p>
        </div>
      </Group>

      <Group
        groupKey="background"
        label="Background"
        hint="Brand swatches, staples, and custom color"
        icon={ImageDown}
        open={open.background}
        onToggle={toggle}
      >
        <BackgroundDrawer canvas={canvas} brandAssets={brandAssets} />
      </Group>

      <Group
        groupKey="patterns"
        label="Patterns"
        hint="Tileable fills in your brand colors"
        icon={Grid3x3}
        open={open.patterns}
        onToggle={toggle}
      >
        <PatternsDrawer canvas={canvas} brandAssets={brandAssets} />
      </Group>
    </div>
  )
}

function Group({
  groupKey,
  label,
  hint,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  groupKey: GroupKey
  label: string
  hint: string
  icon: LucideIcon
  open: boolean
  onToggle: (key: GroupKey) => void
  children: React.ReactNode
}) {
  return (
    <section className="py-1">
      <button
        type="button"
        onClick={() => onToggle(groupKey)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-ink-50"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-700">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold uppercase tracking-[0.05em] text-ink-700">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-normal normal-case tracking-normal text-ink-500">
            {hint}
          </span>
        </span>
        <ChevronDown
          className={
            'h-4 w-4 flex-shrink-0 text-ink-500 transition-transform ' +
            (open ? 'rotate-180' : '')
          }
        />
      </button>

      {open && <div className="px-1 pb-4 pt-2">{children}</div>}
    </section>
  )
}
