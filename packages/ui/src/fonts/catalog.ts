// Font catalog (DS-66a).
//
// A curated subset of the Google Fonts catalog covering ~120 high-utility
// families across the five categories iLaunchify needs for packaging:
//
//   sans         — body + brand text
//   serif        — editorial / heritage brand text
//   display      — large CTA / hero text
//   mono         — codes / data
//   handwriting  — signatures / "artisan" labels
//
// Why not the full ~1,800-font Google catalog: most of those families are
// experimental / single-weight / typographically idiosyncratic for body
// text, and a paradox-of-choice picker buries the genuinely useful ones.
// The list here is heavily weighted toward families that work for both
// screen (canvas preview) AND print (label production at 300 DPI).
//
// To expand: add an entry below; the FontPicker auto-categorizes by
// `category` and the Bunny loader resolves `family` against
// https://fonts.bunny.net/css2 (Google-Fonts-compatible API).
//
// Licensing: every family below is OFL or Apache-licensed and safe for
// commercial label printing.

export type FontCategory =
  | 'sans'
  | 'serif'
  | 'display'
  | 'mono'
  | 'handwriting'

export interface FontEntry {
  family: string
  category: FontCategory
  /** Available weights — drives the weight picker when selecting this family. */
  weights: number[]
  /** Whether the family has true italic variants (vs faux-italic). */
  italic?: boolean
  /** Editorial popularity rank — higher = pushed up in default sort. */
  popularity?: number
  /** Discovery tags surfaced as filter chips. */
  tags?: string[]
}

export const FONT_CATEGORIES: ReadonlyArray<{
  key: FontCategory
  label: string
  hint: string
}> = [
  { key: 'sans', label: 'Sans', hint: 'Clean · screen-friendly · body text' },
  { key: 'serif', label: 'Serif', hint: 'Editorial · heritage · long reads' },
  { key: 'display', label: 'Display', hint: 'Big · loud · hero text' },
  { key: 'mono', label: 'Mono', hint: 'Codes · data · tabular' },
  { key: 'handwriting', label: 'Script', hint: 'Signatures · artisan' },
] as const

/**
 * Curated catalog. Sort is by `popularity` desc within each category in the
 * picker; tags drive the secondary filter chips.
 */
export const FONT_CATALOG: ReadonlyArray<FontEntry> = [
  // ============================================================================
  // SANS-SERIF (workhorses + a wide style range)
  // ============================================================================
  {
    family: 'Inter',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 100,
    tags: ['neutral', 'screen', 'system'],
  },
  {
    family: 'Roboto',
    category: 'sans',
    weights: [100, 300, 400, 500, 700, 900],
    italic: true,
    popularity: 99,
    tags: ['neutral', 'humanist'],
  },
  {
    family: 'Open Sans',
    category: 'sans',
    weights: [300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 98,
    tags: ['humanist', 'friendly'],
  },
  {
    family: 'Lato',
    category: 'sans',
    weights: [100, 300, 400, 700, 900],
    italic: true,
    popularity: 96,
    tags: ['humanist', 'warm'],
  },
  {
    family: 'Poppins',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 95,
    tags: ['geometric', 'rounded'],
  },
  {
    family: 'Montserrat',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 94,
    tags: ['geometric', 'urban'],
  },
  {
    family: 'Nunito',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 92,
    tags: ['rounded', 'friendly'],
  },
  {
    family: 'Work Sans',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 88,
    tags: ['neutral', 'industrial'],
  },
  {
    family: 'Source Sans 3',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 86,
    tags: ['humanist', 'adobe'],
  },
  {
    family: 'Manrope',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800],
    popularity: 84,
    tags: ['geometric', 'modern'],
  },
  {
    family: 'DM Sans',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 83,
    tags: ['geometric', 'modern'],
  },
  {
    family: 'Plus Jakarta Sans',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 82,
    tags: ['humanist', 'modern'],
  },
  {
    family: 'IBM Plex Sans',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700],
    italic: true,
    popularity: 80,
    tags: ['neutral', 'technical'],
  },
  {
    family: 'Karla',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 78,
    tags: ['grotesque'],
  },
  {
    family: 'Public Sans',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 76,
    tags: ['neutral'],
  },
  {
    family: 'Mulish',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 75,
    tags: ['humanist', 'rounded'],
  },
  {
    family: 'Outfit',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 74,
    tags: ['geometric', 'modern'],
  },
  {
    family: 'Sora',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    popularity: 73,
    tags: ['geometric', 'modern'],
  },
  {
    family: 'Albert Sans',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 70,
    tags: ['humanist'],
  },
  {
    family: 'Be Vietnam Pro',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 68,
    tags: ['humanist'],
  },
  {
    family: 'Quicksand',
    category: 'sans',
    weights: [300, 400, 500, 600, 700],
    popularity: 66,
    tags: ['rounded', 'friendly'],
  },
  {
    family: 'Rubik',
    category: 'sans',
    weights: [300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 65,
    tags: ['rounded'],
  },
  {
    family: 'Barlow',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 64,
    tags: ['condensed', 'sport'],
  },
  {
    family: 'Cabin',
    category: 'sans',
    weights: [400, 500, 600, 700],
    italic: true,
    popularity: 62,
    tags: ['humanist'],
  },
  {
    family: 'Figtree',
    category: 'sans',
    weights: [300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 60,
    tags: ['geometric'],
  },
  {
    family: 'Heebo',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 58,
    tags: ['neutral'],
  },
  {
    family: 'Onest',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 56,
    tags: ['humanist', 'modern'],
  },
  {
    family: 'Geist',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 55,
    tags: ['geometric', 'modern'],
  },
  {
    family: 'Bricolage Grotesque',
    category: 'sans',
    weights: [200, 300, 400, 500, 600, 700, 800],
    popularity: 54,
    tags: ['grotesque', 'editorial'],
  },
  {
    family: 'Hanken Grotesk',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 52,
    tags: ['grotesque'],
  },
  {
    family: 'Space Grotesk',
    category: 'sans',
    weights: [300, 400, 500, 600, 700],
    popularity: 50,
    tags: ['grotesque', 'modern'],
  },
  {
    family: 'Archivo',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 48,
    tags: ['grotesque'],
  },
  {
    family: 'Urbanist',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 46,
    tags: ['geometric'],
  },
  {
    family: 'Lexend',
    category: 'sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 44,
    tags: ['humanist', 'accessibility'],
  },
  {
    family: 'Red Hat Display',
    category: 'sans',
    weights: [300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 42,
    tags: ['geometric'],
  },
  {
    family: 'Comfortaa',
    category: 'sans',
    weights: [300, 400, 500, 600, 700],
    popularity: 40,
    tags: ['rounded', 'soft'],
  },

  // ============================================================================
  // SERIF (editorial → heritage)
  // ============================================================================
  {
    family: 'Lora',
    category: 'serif',
    weights: [400, 500, 600, 700],
    italic: true,
    popularity: 95,
    tags: ['editorial', 'modern'],
  },
  {
    family: 'Merriweather',
    category: 'serif',
    weights: [300, 400, 700, 900],
    italic: true,
    popularity: 94,
    tags: ['editorial', 'heritage'],
  },
  {
    family: 'Playfair Display',
    category: 'serif',
    weights: [400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 92,
    tags: ['display', 'high-contrast'],
  },
  {
    family: 'EB Garamond',
    category: 'serif',
    weights: [400, 500, 600, 700, 800],
    italic: true,
    popularity: 88,
    tags: ['classical'],
  },
  {
    family: 'Crimson Pro',
    category: 'serif',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 86,
    tags: ['classical', 'editorial'],
  },
  {
    family: 'Source Serif 4',
    category: 'serif',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 84,
    tags: ['editorial', 'adobe'],
  },
  {
    family: 'PT Serif',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    popularity: 82,
    tags: ['neutral'],
  },
  {
    family: 'Cormorant Garamond',
    category: 'serif',
    weights: [300, 400, 500, 600, 700],
    italic: true,
    popularity: 80,
    tags: ['display', 'classical'],
  },
  {
    family: 'Fraunces',
    category: 'serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 78,
    tags: ['display', 'modern'],
  },
  {
    family: 'DM Serif Display',
    category: 'serif',
    weights: [400],
    italic: true,
    popularity: 76,
    tags: ['display', 'high-contrast'],
  },
  {
    family: 'DM Serif Text',
    category: 'serif',
    weights: [400],
    italic: true,
    popularity: 75,
    tags: ['editorial'],
  },
  {
    family: 'Spectral',
    category: 'serif',
    weights: [200, 300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 72,
    tags: ['editorial'],
  },
  {
    family: 'Libre Baskerville',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    popularity: 70,
    tags: ['classical'],
  },
  {
    family: 'Libre Caslon Text',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    popularity: 66,
    tags: ['classical'],
  },
  {
    family: 'Cardo',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    popularity: 64,
    tags: ['classical', 'literary'],
  },
  {
    family: 'Bitter',
    category: 'serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 62,
    tags: ['slab', 'modern'],
  },
  {
    family: 'Roboto Slab',
    category: 'serif',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 60,
    tags: ['slab', 'modern'],
  },
  {
    family: 'Zilla Slab',
    category: 'serif',
    weights: [300, 400, 500, 600, 700],
    italic: true,
    popularity: 58,
    tags: ['slab'],
  },
  {
    family: 'Domine',
    category: 'serif',
    weights: [400, 500, 600, 700],
    popularity: 56,
    tags: ['editorial'],
  },
  {
    family: 'Newsreader',
    category: 'serif',
    weights: [200, 300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 54,
    tags: ['editorial', 'modern'],
  },
  {
    family: 'Yeseva One',
    category: 'serif',
    weights: [400],
    popularity: 50,
    tags: ['display', 'high-contrast'],
  },
  {
    family: 'Frank Ruhl Libre',
    category: 'serif',
    weights: [300, 400, 500, 700, 900],
    popularity: 48,
    tags: ['editorial'],
  },
  {
    family: 'Old Standard TT',
    category: 'serif',
    weights: [400, 700],
    italic: true,
    popularity: 44,
    tags: ['classical'],
  },

  // ============================================================================
  // DISPLAY (big, loud, brand-defining)
  // ============================================================================
  {
    family: 'Bebas Neue',
    category: 'display',
    weights: [400],
    popularity: 95,
    tags: ['condensed', 'sport'],
  },
  {
    family: 'Anton',
    category: 'display',
    weights: [400],
    popularity: 92,
    tags: ['condensed', 'bold'],
  },
  {
    family: 'Oswald',
    category: 'display',
    weights: [200, 300, 400, 500, 600, 700],
    popularity: 90,
    tags: ['condensed'],
  },
  {
    family: 'Archivo Black',
    category: 'display',
    weights: [400],
    popularity: 88,
    tags: ['bold'],
  },
  {
    family: 'Righteous',
    category: 'display',
    weights: [400],
    popularity: 84,
    tags: ['retro', 'rounded'],
  },
  {
    family: 'Bowlby One',
    category: 'display',
    weights: [400],
    popularity: 80,
    tags: ['bold', 'retro'],
  },
  {
    family: 'Alfa Slab One',
    category: 'display',
    weights: [400],
    popularity: 78,
    tags: ['slab', 'bold'],
  },
  {
    family: 'Lobster',
    category: 'display',
    weights: [400],
    popularity: 76,
    tags: ['script', 'retro'],
  },
  {
    family: 'Pacifico',
    category: 'display',
    weights: [400],
    popularity: 74,
    tags: ['script', 'casual'],
  },
  {
    family: 'Permanent Marker',
    category: 'display',
    weights: [400],
    popularity: 72,
    tags: ['marker', 'casual'],
  },
  {
    family: 'Lilita One',
    category: 'display',
    weights: [400],
    popularity: 70,
    tags: ['bold', 'rounded'],
  },
  {
    family: 'Faster One',
    category: 'display',
    weights: [400],
    popularity: 66,
    tags: ['retro', 'speed'],
  },
  {
    family: 'Black Ops One',
    category: 'display',
    weights: [400],
    popularity: 64,
    tags: ['stencil', 'military'],
  },
  {
    family: 'Russo One',
    category: 'display',
    weights: [400],
    popularity: 62,
    tags: ['bold', 'industrial'],
  },
  {
    family: 'Bungee',
    category: 'display',
    weights: [400],
    popularity: 60,
    tags: ['retro', 'signage'],
  },
  {
    family: 'Bungee Inline',
    category: 'display',
    weights: [400],
    popularity: 58,
    tags: ['inline', 'signage'],
  },
  {
    family: 'Chakra Petch',
    category: 'display',
    weights: [300, 400, 500, 600, 700],
    italic: true,
    popularity: 56,
    tags: ['tech', 'futuristic'],
  },
  {
    family: 'Audiowide',
    category: 'display',
    weights: [400],
    popularity: 54,
    tags: ['futuristic'],
  },
  {
    family: 'Press Start 2P',
    category: 'display',
    weights: [400],
    popularity: 52,
    tags: ['pixel', '8-bit'],
  },
  {
    family: 'Special Elite',
    category: 'display',
    weights: [400],
    popularity: 50,
    tags: ['typewriter', 'distressed'],
  },
  {
    family: 'Major Mono Display',
    category: 'display',
    weights: [400],
    popularity: 48,
    tags: ['mono', 'futuristic'],
  },
  {
    family: 'Monoton',
    category: 'display',
    weights: [400],
    popularity: 46,
    tags: ['inline', 'retro'],
  },
  {
    family: 'Ultra',
    category: 'display',
    weights: [400],
    popularity: 44,
    tags: ['slab', 'heavy'],
  },
  {
    family: 'Abril Fatface',
    category: 'display',
    weights: [400],
    popularity: 42,
    tags: ['high-contrast', 'editorial'],
  },
  {
    family: 'Bree Serif',
    category: 'display',
    weights: [400],
    popularity: 40,
    tags: ['slab'],
  },

  // ============================================================================
  // MONO (codes, data, technical)
  // ============================================================================
  {
    family: 'JetBrains Mono',
    category: 'mono',
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
    italic: true,
    popularity: 95,
    tags: ['code'],
  },
  {
    family: 'Fira Code',
    category: 'mono',
    weights: [300, 400, 500, 600, 700],
    popularity: 92,
    tags: ['code', 'ligatures'],
  },
  {
    family: 'IBM Plex Mono',
    category: 'mono',
    weights: [100, 200, 300, 400, 500, 600, 700],
    italic: true,
    popularity: 88,
    tags: ['code'],
  },
  {
    family: 'Roboto Mono',
    category: 'mono',
    weights: [100, 200, 300, 400, 500, 600, 700],
    italic: true,
    popularity: 86,
    tags: ['neutral'],
  },
  {
    family: 'Source Code Pro',
    category: 'mono',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    italic: true,
    popularity: 84,
    tags: ['code'],
  },
  {
    family: 'Space Mono',
    category: 'mono',
    weights: [400, 700],
    italic: true,
    popularity: 80,
    tags: ['retro'],
  },
  {
    family: 'Inconsolata',
    category: 'mono',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    popularity: 76,
    tags: ['humanist'],
  },
  {
    family: 'DM Mono',
    category: 'mono',
    weights: [300, 400, 500],
    italic: true,
    popularity: 72,
    tags: ['friendly'],
  },
  {
    family: 'Ubuntu Mono',
    category: 'mono',
    weights: [400, 700],
    italic: true,
    popularity: 68,
    tags: ['friendly'],
  },
  {
    family: 'Cousine',
    category: 'mono',
    weights: [400, 700],
    italic: true,
    popularity: 64,
    tags: ['neutral'],
  },
  {
    family: 'Anonymous Pro',
    category: 'mono',
    weights: [400, 700],
    italic: true,
    popularity: 60,
    tags: ['code'],
  },

  // ============================================================================
  // HANDWRITING / SCRIPT (signatures, artisan)
  // ============================================================================
  {
    family: 'Caveat',
    category: 'handwriting',
    weights: [400, 500, 600, 700],
    popularity: 95,
    tags: ['casual', 'pen'],
  },
  {
    family: 'Dancing Script',
    category: 'handwriting',
    weights: [400, 500, 600, 700],
    popularity: 92,
    tags: ['flowing'],
  },
  {
    family: 'Great Vibes',
    category: 'handwriting',
    weights: [400],
    popularity: 88,
    tags: ['formal', 'wedding'],
  },
  {
    family: 'Sacramento',
    category: 'handwriting',
    weights: [400],
    popularity: 84,
    tags: ['formal', 'flowing'],
  },
  {
    family: 'Satisfy',
    category: 'handwriting',
    weights: [400],
    popularity: 80,
    tags: ['casual'],
  },
  {
    family: 'Indie Flower',
    category: 'handwriting',
    weights: [400],
    popularity: 76,
    tags: ['casual', 'rounded'],
  },
  {
    family: 'Kalam',
    category: 'handwriting',
    weights: [300, 400, 700],
    popularity: 72,
    tags: ['casual', 'pen'],
  },
  {
    family: 'Architects Daughter',
    category: 'handwriting',
    weights: [400],
    popularity: 70,
    tags: ['casual', 'print'],
  },
  {
    family: 'Allura',
    category: 'handwriting',
    weights: [400],
    popularity: 66,
    tags: ['formal', 'wedding'],
  },
  {
    family: 'Tangerine',
    category: 'handwriting',
    weights: [400, 700],
    popularity: 62,
    tags: ['formal', 'flowing'],
  },
  {
    family: 'Parisienne',
    category: 'handwriting',
    weights: [400],
    popularity: 60,
    tags: ['formal', 'wedding'],
  },
  {
    family: 'Homemade Apple',
    category: 'handwriting',
    weights: [400],
    popularity: 58,
    tags: ['casual', 'marker'],
  },
  {
    family: 'Shadows Into Light',
    category: 'handwriting',
    weights: [400],
    popularity: 56,
    tags: ['casual', 'print'],
  },
  {
    family: 'Cookie',
    category: 'handwriting',
    weights: [400],
    popularity: 54,
    tags: ['casual', 'flowing'],
  },
  {
    family: 'Yellowtail',
    category: 'handwriting',
    weights: [400],
    popularity: 52,
    tags: ['retro', 'brush'],
  },
  {
    family: 'Marck Script',
    category: 'handwriting',
    weights: [400],
    popularity: 48,
    tags: ['casual', 'pen'],
  },
] as const

/**
 * Look up a font entry by family. Returns undefined if not in the catalog
 * (e.g. an Inter / Bricolage / Fraunces self-hosted bundled family that
 * doesn't need Bunny loading).
 */
export function findFontInCatalog(family: string): FontEntry | undefined {
  return FONT_CATALOG.find((f) => f.family === family)
}

/**
 * The three families we self-host via Fontsource — these don't need to go
 * through the dynamic loader.
 */
export const SELF_HOSTED_FAMILIES = new Set<string>([
  'Inter',
  'Bricolage Grotesque',
  'Fraunces',
])
