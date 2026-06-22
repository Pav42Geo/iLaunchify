// Shared presentation layer for the die-line frame editor (docs/DIELINE_FRAME_EDITOR_SPEC.md).
//
// Single source of truth for how frame SCOPES are coloured, how frame KINDS are
// labelled, and the grouped "add frame" PALETTE. Both die-line editors render
// these:
//   • DielineStudioShell  — standalone /dielines/[id] studio (packaging library)
//   • PackagingStudioStep — inline Step 4 of the product builder
// Keep them importing from here so the two never drift (they were byte-identical
// copies before this extraction — 2026-06-21).

import type { FrameScope, FrameKind } from '@ilaunchify/ui'

export const SCOPE_COLOR: Record<FrameScope, { stroke: string; fill: string; chip: string }> = {
  RECIPE: { stroke: '#059669', fill: 'rgba(5,150,105,0.08)', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MATERIAL: { stroke: '#0284c7', fill: 'rgba(2,132,199,0.08)', chip: 'bg-sky-50 text-sky-700 border-sky-200' },
  PRODUCT: { stroke: '#7c3aed', fill: 'rgba(124,58,237,0.08)', chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  IDENTITY: { stroke: '#d97706', fill: 'rgba(217,119,6,0.08)', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  CREATIVE: { stroke: '#52525b', fill: 'rgba(82,82,91,0.06)', chip: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
}

export const KIND_LABEL: Record<FrameKind, string> = {
  NUTRITION_FACTS: 'Nutrition Facts',
  INGREDIENTS: 'Ingredients',
  ALLERGENS: 'Allergens',
  STATEMENT_OF_IDENTITY: 'Statement of Identity',
  NET_QUANTITY: 'Net Quantity',
  MANUFACTURER: 'Manufacturer',
  BARCODE: 'Barcode',
  RECYCLING_MARK: 'Recycling Mark',
  COMPOSTABILITY: 'Compostability',
  DISPOSAL: 'Disposal',
  CERTIFICATIONS: 'Certifications',
  PHRASES: 'Mandatory Phrases',
  LABELING_SYMBOL: 'Labeling Symbol',
  LOGO: 'Logo',
  IMAGERY: 'Imagery',
  CUSTOM: 'Custom',
}

// Palette grouped by scope (for the Frames drawer "add" menu).
export const PALETTE: { scope: FrameScope; kinds: FrameKind[] }[] = [
  { scope: 'IDENTITY', kinds: ['STATEMENT_OF_IDENTITY', 'NET_QUANTITY', 'MANUFACTURER', 'BARCODE'] },
  { scope: 'RECIPE', kinds: ['NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS'] },
  { scope: 'MATERIAL', kinds: ['RECYCLING_MARK', 'COMPOSTABILITY', 'DISPOSAL'] },
  { scope: 'PRODUCT', kinds: ['CERTIFICATIONS', 'PHRASES', 'LABELING_SYMBOL'] },
  { scope: 'CREATIVE', kinds: ['LOGO', 'IMAGERY', 'CUSTOM'] },
]
