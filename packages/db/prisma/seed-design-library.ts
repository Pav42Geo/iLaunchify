// Seed the DesignLibraryItem table (conceptual name LabelDesignTemplate)
// with 12 starter templates spanning categories, die-cuts, and styles.
// Per task #148 (Design Studio template gallery).
//
// Each row also gets a lightweight Asset row of type TEMPLATE_THUMBNAIL
// using an inline SVG data-URI as publicUrl so the gallery has something
// to render before contractor design assets land. Production replaces
// these with R2-hosted PNG/JPG thumbnails.

import type { PrismaClient } from '@prisma/client'

interface SeedTemplate {
  slug: string
  name: string
  description: string
  dieCutSlug: string
  category: 'BOX_PANEL' | 'BOTTLE_WRAP' | 'TUB_LID' | 'POUCH_FRONT' | 'STICKER' | 'CUSTOM'
  productCategoryFit: Array<'SUPPLEMENT' | 'BEVERAGE_FUNCTIONAL' | 'FOOD'>
  surfaces: Array<'FRONT' | 'BACK' | 'LID' | 'FULL_WRAP' | 'SLEEVE' | 'NECK'>
  styleTags: string[]
  tier: 'REGULAR' | 'PREMIUM' | 'EXCLUSIVE'
  priceCents?: number
  // Visual fingerprint for the inline SVG thumbnail
  bg: string
  accent: string
  headline: string
}

const TEMPLATES: SeedTemplate[] = [
  // ---- SUPPLEMENT / Bottle wrap ----
  {
    slug: 'minimal-mono-bottle',
    name: 'Minimal Mono — Bottle',
    description: 'Single-color typography on a clean wrap. Lets your brand color do the heavy lifting.',
    dieCutSlug: 'oval-2.5x6',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['SUPPLEMENT'],
    surfaces: ['FRONT', 'BACK'],
    styleTags: ['minimalist', 'clinical', 'scientific'],
    tier: 'REGULAR',
    bg: '#f5f5f4',
    accent: '#0f172a',
    headline: 'PROTEIN',
  },
  {
    slug: 'editorial-serif-bottle',
    name: 'Editorial Serif — Bottle',
    description: 'Magazine-style serif headline with generous negative space. Premium feel for wellness.',
    dieCutSlug: 'oval-2.5x6',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['SUPPLEMENT'],
    surfaces: ['FRONT', 'BACK', 'NECK'],
    styleTags: ['luxury', 'wellness', 'organic'],
    tier: 'PREMIUM',
    priceCents: 1900,
    bg: '#fafaf9',
    accent: '#78350f',
    headline: 'Daily',
  },
  {
    slug: 'bold-athletic-bottle',
    name: 'Bold Athletic — Bottle',
    description: 'Stadium-energy heavy display type with diagonal band. Reads from 6 feet away.',
    dieCutSlug: 'oval-2.5x6',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['SUPPLEMENT', 'BEVERAGE_FUNCTIONAL'],
    surfaces: ['FRONT', 'BACK'],
    styleTags: ['bold', 'athletic'],
    tier: 'REGULAR',
    bg: '#171717',
    accent: '#facc15',
    headline: 'FUEL',
  },

  // ---- SUPPLEMENT / Tub lid ----
  {
    slug: 'clinical-tub',
    name: 'Clinical — Tub Lid',
    description: 'Lab-precise grid system with monospaced data callouts. Earns clinical trust.',
    dieCutSlug: 'round-2',
    category: 'TUB_LID',
    productCategoryFit: ['SUPPLEMENT'],
    surfaces: ['LID'],
    styleTags: ['clinical', 'scientific', 'minimalist'],
    tier: 'REGULAR',
    bg: '#ffffff',
    accent: '#1e40af',
    headline: 'RX',
  },
  {
    slug: 'organic-tub',
    name: 'Botanical — Tub Lid',
    description: 'Hand-illustrated leaf motif with a warm cream base. Tells an organic story at a glance.',
    dieCutSlug: 'round-2',
    category: 'TUB_LID',
    productCategoryFit: ['SUPPLEMENT', 'FOOD'],
    surfaces: ['LID'],
    styleTags: ['organic', 'wellness', 'vintage'],
    tier: 'PREMIUM',
    priceCents: 1900,
    bg: '#ecfccb',
    accent: '#365314',
    headline: 'GREENS',
  },

  // ---- BEVERAGE / Can wrap ----
  {
    slug: 'pop-can-playful',
    name: 'Pop Can — Playful',
    description: 'Confetti pattern with rounded gummy headline. Made for shelf-pop in beverage aisles.',
    dieCutSlug: 'wrap-4x12',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['BEVERAGE_FUNCTIONAL'],
    surfaces: ['FULL_WRAP'],
    styleTags: ['playful', 'bold'],
    tier: 'REGULAR',
    bg: '#fb7185',
    accent: '#fef3c7',
    headline: 'POP',
  },
  {
    slug: 'craft-can-vintage',
    name: 'Craft Can — Vintage',
    description: 'Pre-WW2 letterpress-inspired with thick brackets. Reads "small-batch craft" instantly.',
    dieCutSlug: 'wrap-4x12',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['BEVERAGE_FUNCTIONAL'],
    surfaces: ['FULL_WRAP'],
    styleTags: ['vintage', 'organic'],
    tier: 'PREMIUM',
    priceCents: 2900,
    bg: '#fef3c7',
    accent: '#78350f',
    headline: 'CRAFT',
  },
  {
    slug: 'functional-can-tech',
    name: 'Functional Can — Tech',
    description: 'Gradient + lab-grade type. Nootropics, electrolytes, anything that promises performance.',
    dieCutSlug: 'wrap-4x12',
    category: 'BOTTLE_WRAP',
    productCategoryFit: ['BEVERAGE_FUNCTIONAL', 'SUPPLEMENT'],
    surfaces: ['FULL_WRAP'],
    styleTags: ['scientific', 'bold', 'athletic'],
    tier: 'REGULAR',
    bg: '#0c4a6e',
    accent: '#22d3ee',
    headline: 'NEURO',
  },

  // ---- FOOD / Pouch ----
  {
    slug: 'organic-pouch',
    name: 'Organic Pouch',
    description: 'Earth-tone palette with hand-drawn ingredient illustrations. Perfect for snacks + dry goods.',
    dieCutSlug: 'pouch-front-5x7',
    category: 'POUCH_FRONT',
    productCategoryFit: ['FOOD'],
    surfaces: ['FRONT', 'BACK'],
    styleTags: ['organic', 'minimalist', 'wellness'],
    tier: 'REGULAR',
    bg: '#fef3c7',
    accent: '#14532d',
    headline: 'OATS',
  },
  {
    slug: 'studio-pouch',
    name: 'Studio Pouch',
    description: 'Bauhaus geometric tile with a single oversized number. Modern grocery-aisle confidence.',
    dieCutSlug: 'pouch-front-5x7',
    category: 'POUCH_FRONT',
    productCategoryFit: ['FOOD', 'SUPPLEMENT'],
    surfaces: ['FRONT'],
    styleTags: ['bold', 'minimalist'],
    tier: 'PREMIUM',
    priceCents: 1900,
    bg: '#fafaf9',
    accent: '#dc2626',
    headline: '01',
  },

  // ---- Sticker / multi-use ----
  {
    slug: 'circle-stamp-sticker',
    name: 'Circle Stamp',
    description: 'Vintage seal style — works as hero label, certification badge, or limited-edition marker.',
    dieCutSlug: 'sticker-2x3',
    category: 'STICKER',
    productCategoryFit: ['SUPPLEMENT', 'FOOD', 'BEVERAGE_FUNCTIONAL'],
    surfaces: ['FRONT'],
    styleTags: ['vintage', 'luxury'],
    tier: 'REGULAR',
    bg: '#fef3c7',
    accent: '#7c2d12',
    headline: 'SEAL',
  },
  {
    slug: 'modern-tag-sticker',
    name: 'Modern Tag',
    description: 'Single accent block + product name. Clean enough for any category.',
    dieCutSlug: 'sticker-2x3',
    category: 'STICKER',
    productCategoryFit: ['SUPPLEMENT', 'FOOD', 'BEVERAGE_FUNCTIONAL'],
    surfaces: ['FRONT'],
    styleTags: ['minimalist', 'clinical'],
    tier: 'REGULAR',
    bg: '#ffffff',
    accent: '#0f172a',
    headline: 'NEW',
  },
]

// Build a small SVG thumbnail (encoded as data-URI) per template. The
// resulting publicUrl is browser-renderable everywhere with no R2 round
// trip. Production replaces these with rendered PNGs.
function thumbnailDataUri(t: SeedTemplate): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 200" preserveAspectRatio="xMidYMid slice">
  <rect width="280" height="200" fill="${t.bg}"/>
  <rect x="20" y="20" width="240" height="160" rx="6" fill="none" stroke="${t.accent}" stroke-opacity="0.18"/>
  <text x="140" y="115" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="800" fill="${t.accent}" letter-spacing="2">${t.headline}</text>
  <text x="140" y="142" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" fill="${t.accent}" fill-opacity="0.7" letter-spacing="3">${t.category.replace('_', ' ')}</text>
</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export async function seedDesignLibrary(prisma: PrismaClient): Promise<void> {
  const dieCuts = await prisma.dieCutTemplate.findMany({ select: { id: true, slug: true } })
  const dcBySlug = new Map(dieCuts.map((d) => [d.slug, d.id]))

  for (const t of TEMPLATES) {
    const dieCutId = dcBySlug.get(t.dieCutSlug)
    if (!dieCutId) {
      console.warn(`[seed-design-library] die-cut "${t.dieCutSlug}" not found, skipping "${t.slug}"`)
      continue
    }

    // 1. Find-or-create a TEMPLATE_THUMBNAIL Asset for this template.
    //    Idempotent by storageKey (which we synthesize from slug).
    const storageKey = `seed/design-library/${t.slug}.svg`
    const dataUri = thumbnailDataUri(t)
    const asset = await prisma.asset.upsert({
      where: { storageKey },
      update: { publicUrl: dataUri },
      create: {
        ownerType: 'LIBRARY',
        type: 'TEMPLATE_THUMBNAIL',
        source: 'TEMPLATE_RENDER',
        storageKey,
        publicUrl: dataUri,
        mimeType: 'image/svg+xml',
        sizeBytes: dataUri.length,
        widthPx: 280,
        heightPx: 200,
        isPublic: true,
      },
    })

    // 2. Find-or-create the DesignLibraryItem itself. We treat the slug
    //    as the natural key (no schema-level @unique; we look it up by
    //    name+dieCutId since seeds re-run).
    const existing = await prisma.designLibraryItem.findFirst({
      where: { name: t.name },
      select: { id: true },
    })

    const data = {
      name: t.name,
      description: t.description,
      category: t.category,
      dieCutTemplateId: dieCutId,
      previewAssetId: asset.id,
      templateSpec: {
        // Lightweight placeholder spec — real templates serialize Fabric.js
        // state here once the canvas lands. Includes the per-template
        // visual fingerprint so the editor preview can render something
        // recognizable even before Fabric.js wires up.
        version: 1,
        background: t.bg,
        accent: t.accent,
        headline: t.headline,
        surfaces: t.surfaces,
      } as object,
      tags: t.styleTags,
      compatiblePackagingTypeIds: [],
      compatibleSurfaces: t.surfaces,
      productCategoryFit: t.productCategoryFit,
      styleTags: t.styleTags,
      tier: t.tier,
      priceCents: t.priceCents ?? null,
      createdBy: 'DESIGNER' as const,
      lifecycleStatus: 'ACTIVE' as const,
    }

    if (existing) {
      await prisma.designLibraryItem.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await prisma.designLibraryItem.create({ data })
    }
  }

  console.log(`  ✓ seeded ${TEMPLATES.length} DesignLibraryItem rows`)
}
