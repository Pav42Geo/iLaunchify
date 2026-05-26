// Canvas type contracts — pure interfaces, no Fabric dependency so server
// components + the schema layer can use them.
// Per docs/DESIGN_STUDIO_REBUILD.md §3 canvas inventory.

/**
 * DieCutSpec — what the Design Studio canvas needs to render the frame.
 * Sourced from DieCutTemplate rows in the database.
 *
 * All measurements in millimeters. The canvas scales mm → pixels at render
 * time based on the available viewport (preserves aspect ratio).
 */
export interface DieCutSpec {
  id: string
  name: string                    // e.g. "Bottle oval 2.5×6 in"
  category: DieCutCategoryCode    // 'BOTTLE_WRAP' | 'TUB_LID' | ...
  widthMm: number                 // trim-line width
  heightMm: number                // trim-line height
  bleedMm: number                 // extension beyond trim (typically 3.0)
  safeAreaMm: number              // inset from trim where content should live (typically 3.0)
  outlineSvg?: string             // SVG path string for the cut outline (rendered as background mask)
}

export type DieCutCategoryCode =
  | 'BOTTLE_WRAP'
  | 'TUB_LID'
  | 'POUCH_FRONT'
  | 'BOX_PANEL'
  | 'STICKER'
  | 'CUSTOM'

/**
 * Per-die-cut placement zones (Product Name, Nutrition Facts, Ingredients List, etc).
 * Not on the V1 DieCutTemplate model yet — added when admin curation lands.
 * Coordinates are in mm relative to the trim box origin (top-left).
 */
export interface ZoneSpec {
  id: string
  name: string                    // human-readable: "Nutrition Facts"
  type: ZoneType
  required: boolean               // OR-anded into compliance check
  x: number                       // mm from trim left
  y: number                       // mm from trim top
  widthMm: number
  heightMm: number
}

export type ZoneType =
  | 'PRODUCT_NAME'
  | 'NUTRITION_FACTS'
  | 'INGREDIENTS_LIST'
  | 'NET_QUANTITY'
  | 'MANUFACTURER_INFO'
  | 'BARCODE'
  | 'ALLERGEN_STATEMENT'
  | 'GENERIC'

/**
 * Guide visibility toggles — controlled by the canvas Product drawer.
 */
export interface GuideVisibility {
  bleed: boolean
  trim: boolean
  safe: boolean
  zones: boolean
}

export const DEFAULT_GUIDES: GuideVisibility = {
  bleed: true,
  trim: true,
  safe: true,
  zones: true,
}

/**
 * Brand assets surfaced into the canvas. Populated by the page's server loader
 * from the creator's Brand row + linked Asset rows. The canvas drawers consume
 * this to pin brand fonts / brand swatches / brand logos to the top of their
 * respective pickers.
 */
export interface BrandCanvasAssets {
  brandId: string
  brandName: string
  // Colors
  colorPrimary: string | null
  colorSecondary: string | null
  colorAccent: string | null
  extraSwatches: string[]
  // Fonts — TypographyFont references the canvas font dropdown pins to top
  fonts: BrandFontAsset[]
  // Logos — drag onto canvas from the Images drawer's "My Brand" section
  logos: BrandLogoAsset[]
  // Tagline — pre-fillable text element
  tagline: string | null
}

export interface BrandFontAsset {
  id: string
  family: string                  // 'Inter'
  weight: string                  // 'Regular' | 'Bold' | ...
  style: string                   // 'Normal' | 'Italic'
  webfontUrl: string | null       // Google Fonts CSS URL for browser rendering
}

export interface BrandLogoAsset {
  id: string
  variant: 'PRIMARY' | 'ICON' | 'HORIZONTAL'
  publicUrl: string | null
  mimeType: string
}
