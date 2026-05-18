import { z } from 'zod'

export const BrandArchetypeSchema = z.enum([
  'HERO', 'SAGE', 'CAREGIVER', 'EXPLORER', 'CREATOR', 'JESTER',
  'EVERYMAN', 'INNOCENT', 'LOVER', 'MAGICIAN', 'OUTLAW', 'RULER'
])
export type BrandArchetype = z.infer<typeof BrandArchetypeSchema>

// V1 curated font list. Adding to this list is content work, not engineering.
export const APPROVED_FONTS = [
  'Inter',
  'Plus Jakarta Sans',
  'Manrope',
  'Outfit',
  'Space Grotesk',
  'Playfair Display',
  'Merriweather',
  'Cormorant Garamond',
  'Libre Baskerville',
  'Crimson Text',
  'Lora',
  'Source Serif Pro',
  'Poppins',
  'Montserrat',
  'Raleway',
  'DM Sans',
  'Nunito',
  'Work Sans',
  'Lato',
  'Open Sans',
] as const
export type ApprovedFont = (typeof APPROVED_FONTS)[number]

export const BrandThemeSchema = z.object({
  colorPrimary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  colorSecondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  colorAccent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontDisplay: z.enum(APPROVED_FONTS),
  fontBody: z.enum(APPROVED_FONTS),
})
export type BrandTheme = z.infer<typeof BrandThemeSchema>
