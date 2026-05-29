// V1.5+ Phase F1 seed for admin-curated FinishType library.
// Idempotent — safe to re-run.
//
// Per docs/PRINT_FINISHES_PLAN.md §1 — 31 starter finish types across five
// active categories (SURFACE / FOIL_METALLIC / EMBOSS_TEXTURE / CUT / INK +
// SPECIAL). SUBSTRATE is intentionally excluded — material selection lives
// in the post-canvas checkout stepper (Phase G), not the Design Studio.
//
// Partners DO NOT see these until they add a PartnerFinish row pointing at
// one of these types via /partner/services/[id]/finishes (Phase F2).
// Creators DO NOT see the Finishes rail icon until ≥1 PartnerFinish row is
// ACTIVE on the product's bound partner (Phase F3).

import { PrismaClient } from '@prisma/client'

type FinishCategory =
  | 'SURFACE'
  | 'FOIL_METALLIC'
  | 'EMBOSS_TEXTURE'
  | 'CUT'
  | 'INK'
  | 'SPECIAL'

type ApplicationMode =
  | 'WHOLE_DESIGN'
  | 'TEXT_ONLY'
  | 'IMAGE_ONLY'
  | 'TEXT_AND_IMAGES'
  | 'OBJECT_SELECTION'
  | 'REGION_MASK'
  | 'COLOR_BASED'
  | 'UPLOADED_MASK'

interface FinishTypeSeed {
  slug: string
  name: string
  category: FinishCategory
  description: string
  applicationModes: ApplicationMode[]
  defaultPrinterSpec?: string
}

const STARTER_FINISH_TYPES: FinishTypeSeed[] = [
  // ---- 1.1 Surface finishes -------------------------------------------------
  {
    slug: 'spot-uv-gloss',
    name: 'Spot UV Gloss',
    category: 'SURFACE',
    description:
      'Selective high-gloss UV coating applied to specific areas of a matte print — the most common premium effect for label work.',
    applicationModes: [
      'OBJECT_SELECTION',
      'TEXT_ONLY',
      'IMAGE_ONLY',
      'REGION_MASK',
      'UPLOADED_MASK',
    ],
    defaultPrinterSpec:
      'Spot UV — 100% K mask layer, registered to ±0.2mm, gloss level high. Avoid placing within 2mm of die-cut edge.',
  },
  {
    slug: 'flood-uv',
    name: 'Flood UV / Full Gloss',
    category: 'SURFACE',
    description:
      'Whole-design UV gloss coating — uniform shine and an extra protective layer.',
    applicationModes: ['WHOLE_DESIGN'],
    defaultPrinterSpec: 'Flood UV — full coverage, high gloss, post-print application.',
  },
  {
    slug: 'matte-laminate',
    name: 'Matte Laminate',
    category: 'SURFACE',
    description:
      'Velvet-soft matte film over the entire print. Improves durability and gives a high-end tactile feel.',
    applicationModes: ['WHOLE_DESIGN'],
    defaultPrinterSpec: 'Matte film laminate, ~1.5 mil, full-bleed application.',
  },
  {
    slug: 'gloss-laminate',
    name: 'Gloss Laminate',
    category: 'SURFACE',
    description: 'High-shine laminate film over the whole design — wet-look finish.',
    applicationModes: ['WHOLE_DESIGN'],
    defaultPrinterSpec: 'Gloss film laminate, ~1.5 mil, full-bleed application.',
  },
  {
    slug: 'soft-touch-coating',
    name: 'Soft-Touch Coating',
    category: 'SURFACE',
    description:
      'Velvet / suede tactile coating. Common on prestige cosmetics and supplement packaging.',
    applicationModes: ['WHOLE_DESIGN'],
    defaultPrinterSpec: 'Soft-touch aqueous or film coating, full-bleed.',
  },
  {
    slug: 'pearlescent-coating',
    name: 'Pearlescent Coating',
    category: 'SURFACE',
    description: 'Subtle iridescent shimmer — popular for beauty / wellness lines.',
    applicationModes: ['WHOLE_DESIGN', 'REGION_MASK'],
  },
  {
    slug: 'aqueous-coating',
    name: 'Aqueous Coating',
    category: 'SURFACE',
    description: 'Water-based protective coating. Eco-friendly seal layer.',
    applicationModes: ['WHOLE_DESIGN'],
  },
  {
    slug: 'anti-microbial-coating',
    name: 'Anti-Microbial Coating',
    category: 'SURFACE',
    description:
      'EPA-registered anti-microbial coating — often required for food and medical packaging.',
    applicationModes: ['WHOLE_DESIGN'],
  },
  {
    slug: 'scented-varnish',
    name: 'Scented Varnish',
    category: 'SURFACE',
    description: 'Rub-activated scent layer. Promotional / personal care use.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },

  // ---- 1.2 Foil + metallic --------------------------------------------------
  {
    slug: 'hot-foil-stamping',
    name: 'Hot Foil Stamping',
    category: 'FOIL_METALLIC',
    description:
      'Heat-applied metallic foil — gold, silver, copper, rose, holographic. Requires a die.',
    applicationModes: ['OBJECT_SELECTION', 'TEXT_ONLY', 'REGION_MASK', 'UPLOADED_MASK'],
    defaultPrinterSpec:
      'Hot-foil — supply 100% K mask, foil color from Pantone metallic catalog, register ±0.15mm.',
  },
  {
    slug: 'cold-foil',
    name: 'Cold Foil',
    category: 'FOIL_METALLIC',
    description:
      'Foil applied inline during the print run. Lower cost than hot foil, no die required.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY', 'IMAGE_ONLY'],
  },
  {
    slug: 'digital-foil',
    name: 'Digital Foil (Scodix-style)',
    category: 'FOIL_METALLIC',
    description: 'Foil application without dies. Ideal for short runs and variable artwork.',
    applicationModes: ['OBJECT_SELECTION', 'TEXT_ONLY', 'REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'holographic-foil',
    name: 'Holographic Foil',
    category: 'FOIL_METALLIC',
    description: 'Rainbow-shifting iridescent foil. Eye-catching premium effect.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY'],
  },

  // ---- 1.3 Embossing / debossing / texture ---------------------------------
  {
    slug: 'blind-embossing',
    name: 'Blind Embossing',
    category: 'EMBOSS_TEXTURE',
    description: 'Raised relief without ink. Adds tactile depth without visual change.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY'],
  },
  {
    slug: 'registered-embossing',
    name: 'Registered Embossing',
    category: 'EMBOSS_TEXTURE',
    description: 'Raised relief aligned to printed ink. Requires precise registration.',
    applicationModes: ['OBJECT_SELECTION', 'REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY'],
  },
  {
    slug: 'debossing',
    name: 'Debossing',
    category: 'EMBOSS_TEXTURE',
    description: 'Recessed relief into the substrate. The inverse of embossing.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY'],
  },
  {
    slug: 'letterpress',
    name: 'Letterpress',
    category: 'EMBOSS_TEXTURE',
    description: 'Debossing combined with ink — the traditional letterpress look.',
    applicationModes: ['TEXT_ONLY', 'OBJECT_SELECTION', 'REGION_MASK'],
  },
  {
    slug: 'thermography',
    name: 'Thermography',
    category: 'EMBOSS_TEXTURE',
    description: 'Raised "engraving-style" ink finish. Mid-tier alternative to true engraving.',
    applicationModes: ['TEXT_ONLY', 'OBJECT_SELECTION'],
  },
  {
    slug: '3d-raised-print',
    name: '3D Raised Print (Scodix Sense)',
    category: 'EMBOSS_TEXTURE',
    description: 'Tall raised UV deposit — premium tactile effect.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'TEXT_ONLY', 'OBJECT_SELECTION'],
  },

  // ---- 1.4 Cut + die operations --------------------------------------------
  {
    slug: 'die-cut',
    name: 'Custom Die-Cut Shape',
    category: 'CUT',
    description:
      'Cut to a custom outline. Requires a die-line layer supplied with the artwork.',
    applicationModes: ['UPLOADED_MASK'],
    defaultPrinterSpec: 'Die-cut layer on spot "CutContour" plate, 0.25pt magenta stroke.',
  },
  {
    slug: 'kiss-cut',
    name: 'Kiss-Cut',
    category: 'CUT',
    description:
      'Cut through the face material but not the backing. Standard for sticker and label sheets.',
    applicationModes: ['UPLOADED_MASK'],
  },
  {
    slug: 'through-cut',
    name: 'Through-Cut',
    category: 'CUT',
    description: 'Full cut through all layers including backing.',
    applicationModes: ['UPLOADED_MASK'],
  },
  {
    slug: 'window-cut',
    name: 'Window Cut',
    category: 'CUT',
    description:
      'Cut-out window panel in box or carton — often paired with a transparent film insert.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'perforation',
    name: 'Perforation',
    category: 'CUT',
    description: 'Tear-strip perforation for easy opening or tear-off coupons.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'score-crease',
    name: 'Score / Crease Lines',
    category: 'CUT',
    description: 'Pre-creased fold lines for boxes and carton work.',
    applicationModes: ['UPLOADED_MASK'],
  },

  // ---- 1.5 Ink types --------------------------------------------------------
  {
    slug: 'spot-pantone',
    name: 'Pantone Spot Color',
    category: 'INK',
    description:
      'Exact Pantone match printed as a dedicated spot ink (vs. CMYK build). Critical for brand colors.',
    applicationModes: ['COLOR_BASED', 'OBJECT_SELECTION', 'WHOLE_DESIGN'],
    defaultPrinterSpec: 'Supply Pantone reference (e.g., PMS 186 C). One spot plate per color.',
  },
  {
    slug: 'metallic-ink',
    name: 'Metallic Ink',
    category: 'INK',
    description: 'Gold / silver / copper metallic ink. Cheaper than foil with a softer shimmer.',
    applicationModes: ['COLOR_BASED', 'OBJECT_SELECTION', 'TEXT_ONLY'],
  },
  {
    slug: 'fluorescent-ink',
    name: 'Fluorescent / Neon Ink',
    category: 'INK',
    description: 'High-chroma neon inks. Pops under UV light.',
    applicationModes: ['COLOR_BASED', 'OBJECT_SELECTION'],
  },
  {
    slug: 'white-ink',
    name: 'White Ink',
    category: 'INK',
    description: 'Opaque white — required for printing on transparent or dark substrates.',
    applicationModes: ['OBJECT_SELECTION', 'REGION_MASK', 'WHOLE_DESIGN'],
  },
  {
    slug: 'clear-uv-ink',
    name: 'Clear UV-Reactive Ink',
    category: 'INK',
    description: 'Invisible under normal light, glows under UV black light.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'OBJECT_SELECTION'],
  },
  {
    slug: 'security-microtext',
    name: 'Security Microtext / UV Taggant',
    category: 'INK',
    description: 'Anti-counterfeit security inks — microtext, UV taggant, or covert markings.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'thermochromic-ink',
    name: 'Thermochromic Ink',
    category: 'INK',
    description: 'Heat-sensitive ink that changes color at a temperature threshold.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'OBJECT_SELECTION'],
  },
  {
    slug: 'photochromic-ink',
    name: 'Photochromic Ink',
    category: 'INK',
    description: 'UV-light-sensitive ink that darkens in sunlight.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'OBJECT_SELECTION'],
  },

  // ---- 1.7 Special effects --------------------------------------------------
  {
    slug: 'lenticular',
    name: 'Lenticular',
    category: 'SPECIAL',
    description: 'Motion / 3D illusion via lenticular lens layer.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'nfc-embedded',
    name: 'NFC Chip Embedded',
    category: 'SPECIAL',
    description:
      'Embedded NFC tag — links phone-tap to a creator-defined URL or smart-label experience.',
    applicationModes: ['REGION_MASK'],
  },
  {
    slug: 'scratch-off',
    name: 'Scratch-Off Layer',
    category: 'SPECIAL',
    description: 'Scratch-removable opaque layer — for promo codes or reveal mechanics.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK'],
  },
  {
    slug: 'glow-in-the-dark',
    name: 'Phosphorescent (Glow-in-the-Dark)',
    category: 'SPECIAL',
    description: 'Charges under light, glows in darkness.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'OBJECT_SELECTION'],
  },
  {
    slug: 'glitter-coating',
    name: 'Glitter / Sparkle Finish',
    category: 'SPECIAL',
    description: 'Suspended glitter particle coating.',
    applicationModes: ['REGION_MASK', 'UPLOADED_MASK', 'WHOLE_DESIGN'],
  },
]

export async function seedFinishTypes(prisma: PrismaClient): Promise<void> {
  for (const f of STARTER_FINISH_TYPES) {
    await prisma.finishType.upsert({
      where: { slug: f.slug },
      create: {
        slug: f.slug,
        name: f.name,
        category: f.category,
        description: f.description,
        applicationModes: f.applicationModes,
        defaultPrinterSpec: f.defaultPrinterSpec ?? null,
        status: 'ACTIVE',
      },
      update: {
        // Only refresh display-side fields — keep status the admin set.
        name: f.name,
        category: f.category,
        description: f.description,
        applicationModes: f.applicationModes,
        defaultPrinterSpec: f.defaultPrinterSpec ?? null,
      },
    })
  }
  console.log(`  ✓ Seeded ${STARTER_FINISH_TYPES.length} FinishType entries`)
}
