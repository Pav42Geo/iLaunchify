// V1 seed for brand identity curated libraries.
// Per docs/BRAND_IDENTITY_STUDIO.md §3 + task #164.
//
// Expanded from the original placeholder seed (#161) to the full catalog:
//   - 24 TypographyFont rows (12 Google Fonts × heading/body variants)
//   - 20 TypographyPair rows (curated heading + body combos)
//   - 30 ColorPalette rows (4-5 per major style direction)
//   - 12 BrandStylePreset rows mapping to the 10-tag styleTags vocab from
//     docs/CREATOR_ONBOARDING.md (minimalist, vintage, bold, organic,
//     scientific, luxury, playful, wellness, athletic, clinical) + 2 extras
//     (modern, artisan) to cover hybrid styles.
//
// Idempotent — uses upsert-by-slug. Safe to re-run after edits.
//
// WCAG contrast ratios in palette.contrastReport are pre-computed approximations
// for snapshot display. The runtime WCAG checker in /creator/brand/[id]/identity
// (#165) is the source of truth.

import { PrismaClient, FontSource, BrandLibraryStatus } from '@prisma/client'

// -----------------------------------------------------------------------------
// Data: Fonts (24 Google Fonts)
// -----------------------------------------------------------------------------

interface FontDef {
  family: string
  weight: string
  style?: string
  weightNum: number
}

const FONTS: FontDef[] = [
  // Sans-serifs
  { family: 'Inter',             weight: 'Regular', weightNum: 400 },
  { family: 'Inter',             weight: 'Bold',    weightNum: 700 },
  { family: 'Source Sans Pro',   weight: 'Regular', weightNum: 400 },
  { family: 'Source Sans Pro',   weight: 'Bold',    weightNum: 700 },
  { family: 'Work Sans',         weight: 'Regular', weightNum: 400 },
  { family: 'Work Sans',         weight: 'Bold',    weightNum: 700 },
  { family: 'DM Sans',           weight: 'Regular', weightNum: 400 },
  { family: 'DM Sans',           weight: 'Bold',    weightNum: 700 },
  { family: 'Manrope',           weight: 'Regular', weightNum: 400 },
  { family: 'Manrope',           weight: 'ExtraBold', weightNum: 800 },
  { family: 'Poppins',           weight: 'Regular', weightNum: 400 },
  { family: 'Poppins',           weight: 'Bold',    weightNum: 700 },
  // Serifs
  { family: 'Playfair Display',  weight: 'Bold',    weightNum: 700 },
  { family: 'Cormorant Garamond', weight: 'Regular', weightNum: 400 },
  { family: 'Cormorant Garamond', weight: 'Bold',   weightNum: 700 },
  { family: 'Lora',              weight: 'Regular', weightNum: 400 },
  { family: 'Merriweather',      weight: 'Regular', weightNum: 400 },
  { family: 'Merriweather',      weight: 'Bold',    weightNum: 700 },
  // Displays + scripts
  { family: 'Archivo Black',     weight: 'Regular', weightNum: 400 },
  { family: 'Oswald',            weight: 'Bold',    weightNum: 700 },
  { family: 'Bebas Neue',        weight: 'Regular', weightNum: 400 },
  { family: 'Fraunces',          weight: 'Bold',    weightNum: 700 },
  // Mono (for clinical/scientific accents)
  { family: 'JetBrains Mono',    weight: 'Regular', weightNum: 400 },
  { family: 'IBM Plex Mono',     weight: 'Regular', weightNum: 400 },
]

// -----------------------------------------------------------------------------
// Data: Color palettes (30) — full 11-role color systems with WCAG report
// -----------------------------------------------------------------------------

interface PaletteDef {
  slug: string
  name: string
  description: string
  styleTags: string[]
  system: {
    primary: string
    secondary: string
    accent: string
    surface: string
    background: string
    textPrimary: string
    textSecondary: string
    success: string
    warning: string
    error: string
    border: string
  }
  // Pre-computed approximations — runtime checker rebuilds these from hex.
  contrast: Record<string, number>
}

// Helper — common contrast block for high-contrast palettes (most fall here)
const STD_CONTRAST = {
  textPrimary_on_background: 16.0,
  textPrimary_on_surface: 15.2,
  textSecondary_on_background: 4.8,
  primary_on_background: 7.5,
  accent_on_background: 4.6,
}

const PALETTES: PaletteDef[] = [
  // MINIMALIST / MODERN ----------------------------------------------------
  {
    slug: 'arctic-clean',
    name: 'Arctic Clean',
    description: 'Pure whites + cool grays + electric accent. Tech-startup neutral.',
    styleTags: ['minimalist', 'modern', 'clinical'],
    system: {
      primary: '#0F172A', secondary: '#475569', accent: '#0EA5E9',
      surface: '#F8FAFC', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 18.4, accent_on_background: 3.0 },
  },
  {
    slug: 'paper-warm',
    name: 'Paper Warm',
    description: 'Warm cream + charcoal + ochre accent. Editorial calm.',
    styleTags: ['minimalist', 'organic', 'artisan'],
    system: {
      primary: '#262421', secondary: '#6B6660', accent: '#C4843A',
      surface: '#FAF6F0', background: '#FFFCF6',
      textPrimary: '#262421', textSecondary: '#6B6660',
      success: '#5B8C5A', warning: '#B89540', error: '#A64A4A', border: '#E8E2D5',
    },
    contrast: { textPrimary_on_background: 15.1, primary_on_background: 15.1, accent_on_background: 3.7 },
  },
  {
    slug: 'mono-noir',
    name: 'Mono Noir',
    description: 'Black + white + single chromatic accent. Maximum restraint.',
    styleTags: ['minimalist', 'modern', 'luxury'],
    system: {
      primary: '#000000', secondary: '#525252', accent: '#DC2626',
      surface: '#FAFAFA', background: '#FFFFFF',
      textPrimary: '#000000', textSecondary: '#525252',
      success: '#16A34A', warning: '#CA8A04', error: '#DC2626', border: '#E5E5E5',
    },
    contrast: { textPrimary_on_background: 21.0, accent_on_background: 5.9 },
  },

  // VINTAGE / ARTISAN ------------------------------------------------------
  {
    slug: 'sepia-warmth',
    name: 'Sepia Warmth',
    description: 'Aged paper + burnt orange + brown ink. Old-world charm.',
    styleTags: ['vintage', 'artisan', 'organic'],
    system: {
      primary: '#5C3A21', secondary: '#8B6F47', accent: '#C75B12',
      surface: '#F5EBD7', background: '#FAF1DC',
      textPrimary: '#3A2412', textSecondary: '#7A5A3A',
      success: '#6B7F3F', warning: '#C49530', error: '#A03A1F', border: '#D9C9A8',
    },
    contrast: { textPrimary_on_background: 11.3, primary_on_background: 8.0, accent_on_background: 4.1 },
  },
  {
    slug: 'forest-cabin',
    name: 'Forest Cabin',
    description: 'Pine green + bark + cream + rust. Rustic Americana.',
    styleTags: ['vintage', 'organic', 'wellness'],
    system: {
      primary: '#2D4A2B', secondary: '#7B5E3C', accent: '#B8552B',
      surface: '#F2EAD7', background: '#FBF7EA',
      textPrimary: '#1F2F1E', textSecondary: '#5E4D33',
      success: '#5A7C3F', warning: '#B89A40', error: '#A03A1F', border: '#D6C7A1',
    },
    contrast: { textPrimary_on_background: 13.8, primary_on_background: 11.7, accent_on_background: 4.7 },
  },
  {
    slug: 'apothecary-amber',
    name: 'Apothecary Amber',
    description: 'Amber glass + deep teal + ivory. Pharmacy heritage feel.',
    styleTags: ['vintage', 'artisan', 'wellness'],
    system: {
      primary: '#1F3D3A', secondary: '#7D5A30', accent: '#C28A1F',
      surface: '#F4EEDC', background: '#FBF5E3',
      textPrimary: '#1A2A28', textSecondary: '#5E4933',
      success: '#5C8C40', warning: '#C28A1F', error: '#9B3A1F', border: '#DDD0B0',
    },
    contrast: { textPrimary_on_background: 13.6, primary_on_background: 11.0, accent_on_background: 4.0 },
  },

  // ORGANIC / WELLNESS -----------------------------------------------------
  {
    slug: 'sage-serenity',
    name: 'Sage Serenity',
    description: 'Sage + cream + deep moss. Calming wellness baseline.',
    styleTags: ['wellness', 'organic', 'minimalist'],
    system: {
      primary: '#8FA68E', secondary: '#D4D0A8', accent: '#5C7A6E',
      surface: '#FAFAF7', background: '#FFFFFF',
      textPrimary: '#2C2C2A', textSecondary: '#6F6F68',
      success: '#5B8C5A', warning: '#B89540', error: '#A64A4A', border: '#E6E6DF',
    },
    contrast: { textPrimary_on_background: 13.2, primary_on_background: 3.8, accent_on_background: 6.7 },
  },
  {
    slug: 'meadow-bloom',
    name: 'Meadow Bloom',
    description: 'Soft mint + dusty rose + ochre. Florals + apothecary cross.',
    styleTags: ['organic', 'wellness', 'playful'],
    system: {
      primary: '#4A6D58', secondary: '#D49B95', accent: '#C49C4F',
      surface: '#F5F7F0', background: '#FCFCF7',
      textPrimary: '#262C25', textSecondary: '#5A5F58',
      success: '#5B8C5A', warning: '#C49C4F', error: '#A64A4A', border: '#E5E8DC',
    },
    contrast: { textPrimary_on_background: 14.6, primary_on_background: 6.6, accent_on_background: 3.4 },
  },
  {
    slug: 'desert-clay',
    name: 'Desert Clay',
    description: 'Terracotta + bone + olive. Earthy and warm.',
    styleTags: ['organic', 'artisan', 'vintage'],
    system: {
      primary: '#A64A2A', secondary: '#8D8463', accent: '#6B7A3F',
      surface: '#F5EFE3', background: '#FDF8EC',
      textPrimary: '#2D1F17', textSecondary: '#695440',
      success: '#6B7A3F', warning: '#C49530', error: '#A64A2A', border: '#E2D8C0',
    },
    contrast: { textPrimary_on_background: 14.5, primary_on_background: 4.7, accent_on_background: 5.0 },
  },
  {
    slug: 'ocean-breath',
    name: 'Ocean Breath',
    description: 'Sea-glass blue + driftwood + sand. Coastal calm.',
    styleTags: ['wellness', 'organic', 'minimalist'],
    system: {
      primary: '#4A7A8C', secondary: '#9CB4B8', accent: '#C28F5C',
      surface: '#F0F4F2', background: '#FAFCFB',
      textPrimary: '#1F2E33', textSecondary: '#5A6B6F',
      success: '#5B8C5A', warning: '#C28F5C', error: '#A64A4A', border: '#DCE4E3',
    },
    contrast: { textPrimary_on_background: 13.4, primary_on_background: 4.9, accent_on_background: 3.5 },
  },

  // BOLD / ATHLETIC --------------------------------------------------------
  {
    slug: 'electric-pulse',
    name: 'Electric Pulse',
    description: 'Bold black + neon green + raw white. Pre-workout aggression.',
    styleTags: ['bold', 'athletic'],
    system: {
      primary: '#0A0A0A', secondary: '#1F2937', accent: '#A3E635',
      surface: '#F9FAFB', background: '#FFFFFF',
      textPrimary: '#0A0A0A', textSecondary: '#374151',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E5E7EB',
    },
    contrast: { textPrimary_on_background: 20.1, accent_on_background: 1.9 },
  },
  {
    slug: 'arena-red',
    name: 'Arena Red',
    description: 'Crimson + jet black + white. Stadium / fighter energy.',
    styleTags: ['bold', 'athletic'],
    system: {
      primary: '#DC2626', secondary: '#0A0A0A', accent: '#F59E0B',
      surface: '#FAFAFA', background: '#FFFFFF',
      textPrimary: '#0A0A0A', textSecondary: '#4B5563',
      success: '#16A34A', warning: '#F59E0B', error: '#DC2626', border: '#E5E5E5',
    },
    contrast: { textPrimary_on_background: 20.1, primary_on_background: 5.9, accent_on_background: 2.5 },
  },
  {
    slug: 'court-cobalt',
    name: 'Court Cobalt',
    description: 'Cobalt + safety yellow + concrete gray. Performance edge.',
    styleTags: ['bold', 'athletic', 'scientific'],
    system: {
      primary: '#1E3A8A', secondary: '#4B5563', accent: '#FACC15',
      surface: '#F4F4F5', background: '#FFFFFF',
      textPrimary: '#1F2937', textSecondary: '#4B5563',
      success: '#10B981', warning: '#FACC15', error: '#EF4444', border: '#E5E7EB',
    },
    contrast: { textPrimary_on_background: 14.7, primary_on_background: 11.7, accent_on_background: 1.6 },
  },
  {
    slug: 'midnight-volt',
    name: 'Midnight Volt',
    description: 'Deep navy + volt yellow + carbon. Nighttime gym energy.',
    styleTags: ['bold', 'athletic'],
    system: {
      primary: '#0F172A', secondary: '#1E293B', accent: '#FACC15',
      surface: '#1F2937', background: '#0F172A',
      textPrimary: '#F8FAFC', textSecondary: '#CBD5E1',
      success: '#10B981', warning: '#FACC15', error: '#EF4444', border: '#334155',
    },
    contrast: { textPrimary_on_background: 18.4, accent_on_background: 10.7 },
  },

  // SCIENTIFIC / CLINICAL --------------------------------------------------
  {
    slug: 'lab-cyan',
    name: 'Lab Cyan',
    description: 'Bright cyan + slate + crisp white. Lab-coat precision.',
    styleTags: ['scientific', 'clinical', 'modern'],
    system: {
      primary: '#0891B2', secondary: '#475569', accent: '#7C3AED',
      surface: '#F8FAFC', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 4.6, accent_on_background: 6.1 },
  },
  {
    slug: 'med-mint',
    name: 'Med Mint',
    description: 'Soft mint + neutral gray + white. Pharma-soft.',
    styleTags: ['clinical', 'scientific', 'wellness'],
    system: {
      primary: '#0D9488', secondary: '#6B7280', accent: '#0EA5E9',
      surface: '#F0FDFA', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#CCFBF1',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 5.1, accent_on_background: 3.0 },
  },
  {
    slug: 'precision-graphite',
    name: 'Precision Graphite',
    description: 'Graphite + steel + electric blue. Lab/engineering bridge.',
    styleTags: ['scientific', 'modern', 'bold'],
    system: {
      primary: '#374151', secondary: '#9CA3AF', accent: '#0EA5E9',
      surface: '#F3F4F6', background: '#FFFFFF',
      textPrimary: '#111827', textSecondary: '#4B5563',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E5E7EB',
    },
    contrast: { ...STD_CONTRAST, primary_on_background: 10.8 },
  },

  // LUXURY -----------------------------------------------------------------
  {
    slug: 'ivory-noir',
    name: 'Ivory Noir',
    description: 'Ink + cream + brushed gold. Heritage luxury.',
    styleTags: ['luxury', 'minimalist', 'vintage'],
    system: {
      primary: '#1A1A1A', secondary: '#8C8479', accent: '#B89A4A',
      surface: '#F8F4EC', background: '#FCFAF3',
      textPrimary: '#1A1A1A', textSecondary: '#5E574D',
      success: '#6B7F3F', warning: '#B89A4A', error: '#9B3A1F', border: '#E8DFCB',
    },
    contrast: { textPrimary_on_background: 17.0, accent_on_background: 4.4 },
  },
  {
    slug: 'champagne-rose',
    name: 'Champagne Rose',
    description: 'Blush pink + champagne + soft black. Beauty premium.',
    styleTags: ['luxury', 'playful', 'wellness'],
    system: {
      primary: '#2D2424', secondary: '#A18472', accent: '#D4A5A0',
      surface: '#FAF4F0', background: '#FCF8F4',
      textPrimary: '#2D2424', textSecondary: '#6E5A50',
      success: '#6B7F3F', warning: '#B89A4A', error: '#9B3A1F', border: '#EDDCD2',
    },
    contrast: { textPrimary_on_background: 14.9, primary_on_background: 14.9, accent_on_background: 2.0 },
  },
  {
    slug: 'midnight-emerald',
    name: 'Midnight Emerald',
    description: 'Deep emerald + gold leaf + warm ivory. Old-money apothecary.',
    styleTags: ['luxury', 'vintage', 'wellness'],
    system: {
      primary: '#0F4D3F', secondary: '#B89A4A', accent: '#0F4D3F',
      surface: '#F4EFE0', background: '#FBF6E5',
      textPrimary: '#1A1F1B', textSecondary: '#4E5A4E',
      success: '#5B8C5A', warning: '#B89A4A', error: '#A03A1F', border: '#E0D6B6',
    },
    contrast: { textPrimary_on_background: 15.0, primary_on_background: 8.6, accent_on_background: 4.1 },
  },

  // PLAYFUL ----------------------------------------------------------------
  {
    slug: 'candy-pop',
    name: 'Candy Pop',
    description: 'Hot pink + bright yellow + sky blue. Bubblegum energy.',
    styleTags: ['playful', 'bold'],
    system: {
      primary: '#EC4899', secondary: '#FACC15', accent: '#0EA5E9',
      surface: '#FFF1F2', background: '#FFFFFF',
      textPrimary: '#1F2937', textSecondary: '#6B7280',
      success: '#10B981', warning: '#FACC15', error: '#EF4444', border: '#FECDD3',
    },
    contrast: { textPrimary_on_background: 14.7, primary_on_background: 3.6, accent_on_background: 3.0 },
  },
  {
    slug: 'sunshine-citrus',
    name: 'Sunshine Citrus',
    description: 'Tangerine + lime + cream. Bright + appetite-stimulating.',
    styleTags: ['playful', 'organic', 'bold'],
    system: {
      primary: '#EA580C', secondary: '#65A30D', accent: '#FACC15',
      surface: '#FEF7ED', background: '#FFFDF7',
      textPrimary: '#1C1917', textSecondary: '#57534E',
      success: '#65A30D', warning: '#FACC15', error: '#DC2626', border: '#FDE68A',
    },
    contrast: { textPrimary_on_background: 16.4, primary_on_background: 4.9, accent_on_background: 1.8 },
  },
  {
    slug: 'gummy-rainbow',
    name: 'Gummy Rainbow',
    description: 'Berry + grape + lemon. Kids supplements / gummies.',
    styleTags: ['playful'],
    system: {
      primary: '#A21CAF', secondary: '#0EA5E9', accent: '#F59E0B',
      surface: '#FAF5FF', background: '#FFFFFF',
      textPrimary: '#1F2937', textSecondary: '#6B7280',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E9D5FF',
    },
    contrast: { textPrimary_on_background: 14.7, primary_on_background: 9.8, accent_on_background: 2.5 },
  },

  // MODERN / NEUTRAL extras ------------------------------------------------
  {
    slug: 'plum-soft',
    name: 'Plum Soft',
    description: 'Muted plum + soft gray + cream. Refined feminine.',
    styleTags: ['minimalist', 'wellness', 'luxury'],
    system: {
      primary: '#7C3AED', secondary: '#94A3B8', accent: '#F59E0B',
      surface: '#FAFAF9', background: '#FFFFFF',
      textPrimary: '#1F2937', textSecondary: '#6B7280',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E5E7EB',
    },
    contrast: { textPrimary_on_background: 14.7, primary_on_background: 6.1, accent_on_background: 2.5 },
  },
  {
    slug: 'graphite-zest',
    name: 'Graphite Zest',
    description: 'Slate + citrus pop + warm white. Daily-driver modern.',
    styleTags: ['modern', 'minimalist'],
    system: {
      primary: '#1F2937', secondary: '#6B7280', accent: '#EAB308',
      surface: '#F9FAFB', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#EAB308', error: '#EF4444', border: '#E5E7EB',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 14.7, accent_on_background: 2.7 },
  },
  {
    slug: 'glacial',
    name: 'Glacial',
    description: 'Ice white + slate + cool accent. Spa-clean.',
    styleTags: ['clinical', 'wellness', 'minimalist'],
    system: {
      primary: '#475569', secondary: '#94A3B8', accent: '#06B6D4',
      surface: '#F8FAFC', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 6.4, accent_on_background: 3.4 },
  },
  {
    slug: 'jungle-mint',
    name: 'Jungle Mint',
    description: 'Forest green + minty highlight + cream. Greens / superfood.',
    styleTags: ['organic', 'wellness', 'athletic'],
    system: {
      primary: '#166534', secondary: '#4D7C0F', accent: '#A3E635',
      surface: '#F0FDF4', background: '#FBFCF6',
      textPrimary: '#14532D', textSecondary: '#3F6212',
      success: '#16A34A', warning: '#CA8A04', error: '#DC2626', border: '#D9F99D',
    },
    contrast: { textPrimary_on_background: 11.5, primary_on_background: 9.4, accent_on_background: 1.9 },
  },
  {
    slug: 'cocoa-rose',
    name: 'Cocoa Rose',
    description: 'Warm cocoa + dusty rose + cream. Skincare-adjacent food.',
    styleTags: ['wellness', 'luxury', 'organic'],
    system: {
      primary: '#7B3F2E', secondary: '#C97964', accent: '#D4A574',
      surface: '#FBF5EE', background: '#FDFAF4',
      textPrimary: '#2D1B16', textSecondary: '#6B4A3E',
      success: '#5B8C5A', warning: '#B89540', error: '#A03A1F', border: '#E8D7C0',
    },
    contrast: { textPrimary_on_background: 14.3, primary_on_background: 7.2, accent_on_background: 2.4 },
  },
  {
    slug: 'arctic-storm',
    name: 'Arctic Storm',
    description: 'Slate blue + soft snow + steel accent. Modern outdoor.',
    styleTags: ['modern', 'athletic', 'minimalist'],
    system: {
      primary: '#1E40AF', secondary: '#64748B', accent: '#0EA5E9',
      surface: '#F1F5F9', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#475569',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0',
    },
    contrast: { textPrimary_on_background: 18.4, primary_on_background: 9.5, accent_on_background: 3.0 },
  },
  {
    slug: 'bold-navy',
    name: 'Bold Navy',
    description: 'Deep navy + electric blue + amber. Tech-meets-classic.',
    styleTags: ['bold', 'modern', 'scientific'],
    system: {
      primary: '#0A2540', secondary: '#0EA5E9', accent: '#F59E0B',
      surface: '#F8FAFC', background: '#FFFFFF',
      textPrimary: '#0F172A', textSecondary: '#64748B',
      success: '#10B981', warning: '#F59E0B', error: '#EF4444', border: '#E2E8F0',
    },
    contrast: { textPrimary_on_background: 17.6, primary_on_background: 14.5, accent_on_background: 2.5 },
  },
  {
    slug: 'sandstone',
    name: 'Sandstone',
    description: 'Warm sand + deep olive + terracotta. Mediterranean.',
    styleTags: ['organic', 'artisan', 'vintage'],
    system: {
      primary: '#8B5A2B', secondary: '#5B7036', accent: '#C24A22',
      surface: '#FBF5E6', background: '#FFFCEC',
      textPrimary: '#2D1F12', textSecondary: '#5E4D33',
      success: '#5B7036', warning: '#B89540', error: '#C24A22', border: '#E2D5B5',
    },
    contrast: { textPrimary_on_background: 15.4, primary_on_background: 5.6, accent_on_background: 4.5 },
  },
]

// -----------------------------------------------------------------------------
// Data: Typography pairs (20)
// -----------------------------------------------------------------------------

interface PairDef {
  slug: string
  name: string
  description: string
  styleTags: string[]
  headingFamily: string
  headingWeight: string
  bodyFamily: string
  bodyWeight: string
  ratio: number
}

const PAIRS: PairDef[] = [
  { slug: 'inter-pair', name: 'Inter (Bold + Regular)', description: 'Workhorse sans. Reads cleanly at all sizes.', styleTags: ['modern', 'minimalist'], headingFamily: 'Inter', headingWeight: 'Bold', bodyFamily: 'Inter', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'work-sans-pair', name: 'Work Sans Duo', description: 'Geometric warmth, professional polish.', styleTags: ['modern', 'wellness'], headingFamily: 'Work Sans', headingWeight: 'Bold', bodyFamily: 'Work Sans', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'dm-sans-pair', name: 'DM Sans Duo', description: 'Modern Swiss-style geometry.', styleTags: ['minimalist', 'modern', 'clinical'], headingFamily: 'DM Sans', headingWeight: 'Bold', bodyFamily: 'DM Sans', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'manrope-pair', name: 'Manrope (ExtraBold + Regular)', description: 'Open contemporary sans. Strong display headings.', styleTags: ['modern', 'bold', 'scientific'], headingFamily: 'Manrope', headingWeight: 'ExtraBold', bodyFamily: 'Manrope', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'poppins-pair', name: 'Poppins Duo', description: 'Friendly geometric. Approachable wellness.', styleTags: ['wellness', 'playful'], headingFamily: 'Poppins', headingWeight: 'Bold', bodyFamily: 'Poppins', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'source-sans-pair', name: 'Source Sans Pro Duo', description: 'Adobe humanist sans, very readable.', styleTags: ['clinical', 'scientific'], headingFamily: 'Source Sans Pro', headingWeight: 'Bold', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'playfair-source-sans', name: 'Playfair Display + Source Sans Pro', description: 'Editorial serif headings + clean sans body.', styleTags: ['luxury', 'vintage', 'wellness'], headingFamily: 'Playfair Display', headingWeight: 'Bold', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'cormorant-lora', name: 'Cormorant Garamond + Lora', description: 'Refined serif duo. Heritage feel.', styleTags: ['luxury', 'vintage', 'artisan'], headingFamily: 'Cormorant Garamond', headingWeight: 'Bold', bodyFamily: 'Lora', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'fraunces-inter', name: 'Fraunces + Inter', description: 'Quirky variable serif + neutral sans body.', styleTags: ['vintage', 'artisan', 'playful'], headingFamily: 'Fraunces', headingWeight: 'Bold', bodyFamily: 'Inter', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'merriweather-pair', name: 'Merriweather Duo', description: 'Serif throughout. Booklike, deep.', styleTags: ['artisan', 'vintage'], headingFamily: 'Merriweather', headingWeight: 'Bold', bodyFamily: 'Merriweather', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'archivo-inter', name: 'Archivo Black + Inter', description: 'Massive display headings + clean body.', styleTags: ['bold', 'athletic'], headingFamily: 'Archivo Black', headingWeight: 'Regular', bodyFamily: 'Inter', bodyWeight: 'Regular', ratio: 1.414 },
  { slug: 'oswald-source-sans', name: 'Oswald + Source Sans Pro', description: 'Condensed display + humanist body. Stadium energy.', styleTags: ['bold', 'athletic'], headingFamily: 'Oswald', headingWeight: 'Bold', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'bebas-inter', name: 'Bebas Neue + Inter', description: 'All-caps display + clean body. Energy-drink loud.', styleTags: ['bold', 'athletic'], headingFamily: 'Bebas Neue', headingWeight: 'Regular', bodyFamily: 'Inter', bodyWeight: 'Regular', ratio: 1.414 },
  { slug: 'oswald-lora', name: 'Oswald + Lora', description: 'Display sans + serif body. Editorial sports.', styleTags: ['bold', 'modern'], headingFamily: 'Oswald', headingWeight: 'Bold', bodyFamily: 'Lora', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'jetbrains-inter', name: 'JetBrains Mono + Inter', description: 'Mono headings + sans body. Lab/biotech aesthetic.', styleTags: ['scientific', 'clinical', 'modern'], headingFamily: 'JetBrains Mono', headingWeight: 'Regular', bodyFamily: 'Inter', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'ibm-plex-pair', name: 'IBM Plex Mono + Source Sans Pro', description: 'Mono accents + readable body. Enterprise/clinical.', styleTags: ['scientific', 'clinical'], headingFamily: 'IBM Plex Mono', headingWeight: 'Regular', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'poppins-lora', name: 'Poppins + Lora', description: 'Round sans headings + warm serif body.', styleTags: ['organic', 'wellness', 'playful'], headingFamily: 'Poppins', headingWeight: 'Bold', bodyFamily: 'Lora', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'cormorant-source-sans', name: 'Cormorant Garamond + Source Sans Pro', description: 'High-contrast serif + workhorse body.', styleTags: ['luxury', 'wellness'], headingFamily: 'Cormorant Garamond', headingWeight: 'Bold', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.333 },
  { slug: 'work-sans-lora', name: 'Work Sans + Lora', description: 'Geometric sans + warm serif body.', styleTags: ['wellness', 'organic'], headingFamily: 'Work Sans', headingWeight: 'Bold', bodyFamily: 'Lora', bodyWeight: 'Regular', ratio: 1.250 },
  { slug: 'fraunces-source-sans', name: 'Fraunces + Source Sans Pro', description: 'Distinctive serif + clean body. Modern editorial.', styleTags: ['artisan', 'modern', 'luxury'], headingFamily: 'Fraunces', headingWeight: 'Bold', bodyFamily: 'Source Sans Pro', bodyWeight: 'Regular', ratio: 1.333 },
]

// -----------------------------------------------------------------------------
// Data: Brand style presets (12)
// Each maps to a recommended palette + typography pair.
// -----------------------------------------------------------------------------

interface PresetDef {
  slug: string
  name: string
  description: string
  styleTags: string[]
  paletteSlug: string
  pairSlug: string
  sampleTagline: string
}

const PRESETS: PresetDef[] = [
  { slug: 'modern-minimalist-wellness', name: 'Modern Minimalist Wellness', description: 'Clean type, soft palette, calming negative space. Daily wellness staple.', styleTags: ['minimalist', 'wellness', 'modern'], paletteSlug: 'sage-serenity', pairSlug: 'work-sans-pair', sampleTagline: 'Less, but better.' },
  { slug: 'bold-scientific-performance', name: 'Bold Scientific Performance', description: 'High-contrast modern type, navy + electric blue. Performance supplements.', styleTags: ['bold', 'scientific', 'athletic'], paletteSlug: 'bold-navy', pairSlug: 'manrope-pair', sampleTagline: 'Backed by research. Built for results.' },
  { slug: 'editorial-luxury', name: 'Editorial Luxury', description: 'Display serif headings, ink + gold accents. Heritage premium feel.', styleTags: ['luxury', 'minimalist', 'vintage'], paletteSlug: 'ivory-noir', pairSlug: 'playfair-source-sans', sampleTagline: 'A line of distinction.' },
  { slug: 'artisan-craft', name: 'Artisan Craft', description: 'Sepia + serif duo. Small-batch hot sauce / preserves.', styleTags: ['artisan', 'vintage', 'organic'], paletteSlug: 'sepia-warmth', pairSlug: 'cormorant-lora', sampleTagline: 'Hand-made, slowly.' },
  { slug: 'stadium-athletic', name: 'Stadium Athletic', description: 'Black + neon + condensed display. Pre-workout / gym brands.', styleTags: ['bold', 'athletic'], paletteSlug: 'electric-pulse', pairSlug: 'bebas-inter', sampleTagline: 'Earn every rep.' },
  { slug: 'apothecary-organic', name: 'Apothecary Organic', description: 'Amber + teal + serif. Heritage wellness / herbal.', styleTags: ['vintage', 'organic', 'wellness'], paletteSlug: 'apothecary-amber', pairSlug: 'merriweather-pair', sampleTagline: 'From the garden, gently distilled.' },
  { slug: 'clinical-precise', name: 'Clinical Precise', description: 'Mono + sans, mint palette. Pharma-soft.', styleTags: ['clinical', 'scientific'], paletteSlug: 'med-mint', pairSlug: 'jetbrains-inter', sampleTagline: 'Engineered for daily use.' },
  { slug: 'playful-gummy', name: 'Playful Gummy', description: 'Bright multi-color + rounded sans. Kids gummies / fun supplements.', styleTags: ['playful'], paletteSlug: 'gummy-rainbow', pairSlug: 'poppins-pair', sampleTagline: 'Yum meets vitamins.' },
  { slug: 'forest-craft', name: 'Forest Craft', description: 'Pine + serif. Rustic Americana foods.', styleTags: ['vintage', 'organic', 'artisan'], paletteSlug: 'forest-cabin', pairSlug: 'fraunces-inter', sampleTagline: 'The good stuff, simply made.' },
  { slug: 'beauty-soft-luxury', name: 'Beauty Soft Luxury', description: 'Champagne + rose + serif. Beauty-adjacent supplements.', styleTags: ['luxury', 'wellness', 'playful'], paletteSlug: 'champagne-rose', pairSlug: 'cormorant-source-sans', sampleTagline: 'Inner glow, outer radiance.' },
  { slug: 'lab-tech', name: 'Lab Tech', description: 'Cyan + slate + mono. Biotech / functional supplements.', styleTags: ['scientific', 'modern', 'clinical'], paletteSlug: 'lab-cyan', pairSlug: 'ibm-plex-pair', sampleTagline: 'Data-driven nutrition.' },
  { slug: 'green-superfood', name: 'Green Superfood', description: 'Jungle mint + clean sans. Greens powders + plant-based.', styleTags: ['organic', 'wellness', 'athletic'], paletteSlug: 'jungle-mint', pairSlug: 'work-sans-lora', sampleTagline: 'Daily greens, every day.' },
]

// -----------------------------------------------------------------------------
// Main seed
// -----------------------------------------------------------------------------

export async function seedBrandIdentity(prisma: PrismaClient) {
  console.log('Seeding brand identity curated libraries (full catalog, #164)...')

  // --- Fonts ---
  const fontByKey = new Map<string, string>()
  for (const f of FONTS) {
    const style = f.style ?? 'Normal'
    const webfontFamily = f.family.replace(/ /g, '+')
    const created = await prisma.typographyFont.upsert({
      where: { family_weight_style: { family: f.family, weight: f.weight, style } },
      update: {},
      create: {
        family: f.family,
        weight: f.weight,
        style,
        source: FontSource.GOOGLE_FONTS,
        webfontUrl: `https://fonts.googleapis.com/css2?family=${webfontFamily}:wght@${f.weightNum}&display=swap`,
        unicodeRanges: ['latin', 'latin-ext'],
        licenseTerms: 'SIL Open Font License 1.1 — free for commercial use',
        status: BrandLibraryStatus.ACTIVE,
      },
    })
    fontByKey.set(`${f.family}|${f.weight}`, created.id)
  }
  console.log(`  ✓ ${FONTS.length} fonts.`)

  // --- Palettes ---
  const paletteBySlug = new Map<string, string>()
  for (const p of PALETTES) {
    const created = await prisma.colorPalette.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        colorSystem: p.system,
        contrastReport: p.contrast,
      },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        colorSystem: p.system,
        contrastReport: p.contrast,
        isCurated: true,
        status: BrandLibraryStatus.ACTIVE,
      },
    })
    paletteBySlug.set(p.slug, created.id)
  }
  console.log(`  ✓ ${PALETTES.length} color palettes.`)

  // --- Pairs ---
  const pairBySlug = new Map<string, string>()
  for (const p of PAIRS) {
    const headingId = fontByKey.get(`${p.headingFamily}|${p.headingWeight}`)
    const bodyId = fontByKey.get(`${p.bodyFamily}|${p.bodyWeight}`)
    if (!headingId || !bodyId) {
      console.warn(`  ⚠ Skipping pair ${p.slug} — missing font reference.`)
      continue
    }
    const created = await prisma.typographyPair.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        headingFontId: headingId,
        bodyFontId: bodyId,
        recommendedRatio: p.ratio,
      },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        headingFontId: headingId,
        bodyFontId: bodyId,
        recommendedRatio: p.ratio,
        status: BrandLibraryStatus.ACTIVE,
      },
    })
    pairBySlug.set(p.slug, created.id)
  }
  console.log(`  ✓ ${PAIRS.length} typography pairs.`)

  // --- Presets ---
  for (const p of PRESETS) {
    const paletteId = paletteBySlug.get(p.paletteSlug)
    const pairId = pairBySlug.get(p.pairSlug)
    if (!paletteId || !pairId) {
      console.warn(`  ⚠ Skipping preset ${p.slug} — missing palette/pair reference.`)
      continue
    }
    await prisma.brandStylePreset.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        recommendedColorPaletteId: paletteId,
        recommendedTypographyPairId: pairId,
        sampleTagline: p.sampleTagline,
      },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        styleTags: p.styleTags,
        recommendedColorPaletteId: paletteId,
        recommendedTypographyPairId: pairId,
        sampleTagline: p.sampleTagline,
        status: BrandLibraryStatus.ACTIVE,
      },
    })
  }
  console.log(`  ✓ ${PRESETS.length} brand style presets.`)
}
