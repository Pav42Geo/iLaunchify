// Phase G3 seed — Substrate + PackagingMaterial starter catalogs.
//
// Per the G3 standardisation commitment (memory:
// [[ilaunchify-g3-standardize-capabilities]]) these are typed admin-
// curated rows, NOT free-text JSON on PartnerService.capabilities.
// Partners declare which subset they offer via PartnerServiceSubstrate +
// PartnerServicePackagingMaterial junctions.
//
// Cost values are baseline surcharges over the cheapest option in the
// same category, in cents per unit. Real partner-side prices land in
// the junction tables (perUnitCostCents override).
//
// Idempotent — safe to re-run.

import { PrismaClient } from '@prisma/client'

type SubstrateCategory =
  | 'PAPER_COATED'
  | 'PAPER_UNCOATED'
  | 'KRAFT_RECYCLED'
  | 'FILM_BOPP'
  | 'FILM_CLEAR'
  | 'FILM_METALLIC'
  | 'SPECIALTY'

type SustainabilityTier =
  | 'STANDARD'
  | 'RECYCLED'
  | 'COMPOSTABLE'
  | 'BIODEGRADABLE'

type PackagingTopology =
  | 'SINGLE_CONTAINER'
  | 'MULTI_CONTAINER_BOX'
  | 'STICK_PACK'
  | 'SACHET'
  | 'CASE'
  | 'CAPSULE_JAR'
  | 'POUCH_STAND_UP'
  | 'POUCH_FLAT'
  | 'TUBE'
  | 'OTHER'

interface SubstrateSeed {
  slug: string
  name: string
  category: SubstrateCategory
  description: string
  baseUnitCostCents: number
  sustainabilityTier?: SustainabilityTier
  finishCompatibility?: string[]
}

const SUBSTRATES: SubstrateSeed[] = [
  // ---- PAPER_COATED (entry tier) ----
  {
    slug: 'matte-coated-paper',
    name: 'Matte Coated Paper',
    category: 'PAPER_COATED',
    description: 'Smooth matte-finish coated paper. The default starting point for most labels.',
    baseUnitCostCents: 0,
    finishCompatibility: ['spot-uv-gloss', 'flood-uv', 'matte-laminate', 'foil-stamping', 'embossing'],
  },
  {
    slug: 'gloss-coated-paper',
    name: 'Gloss Coated Paper',
    category: 'PAPER_COATED',
    description: 'High-shine coated paper. Pops bright colors.',
    baseUnitCostCents: 2,
    finishCompatibility: ['flood-uv', 'foil-stamping', 'embossing'],
  },

  // ---- PAPER_UNCOATED (textured, natural look) ----
  {
    slug: 'natural-uncoated',
    name: 'Natural Uncoated',
    category: 'PAPER_UNCOATED',
    description: 'Tactile uncoated paper with a natural, premium feel. Common on craft brands.',
    baseUnitCostCents: 4,
    sustainabilityTier: 'RECYCLED',
    finishCompatibility: ['letterpress', 'blind-embossing', 'foil-stamping'],
  },
  {
    slug: 'textured-felt',
    name: 'Textured Felt',
    category: 'PAPER_UNCOATED',
    description: 'Subtle felt-textured uncoated paper. Premium craft / boutique aesthetic.',
    baseUnitCostCents: 7,
    finishCompatibility: ['blind-embossing', 'letterpress', 'foil-stamping'],
  },

  // ---- KRAFT_RECYCLED (eco-forward) ----
  {
    slug: 'kraft-recycled',
    name: 'Recycled Kraft',
    category: 'KRAFT_RECYCLED',
    description: 'Post-consumer recycled brown kraft. Industry-standard eco choice.',
    baseUnitCostCents: 3,
    sustainabilityTier: 'RECYCLED',
    finishCompatibility: ['blind-embossing', 'foil-stamping'],
  },
  {
    slug: 'compostable-kraft',
    name: 'Compostable Kraft',
    category: 'KRAFT_RECYCLED',
    description: 'BPI-certified compostable kraft. Decomposes in commercial facilities.',
    baseUnitCostCents: 9,
    sustainabilityTier: 'COMPOSTABLE',
  },

  // ---- FILM_BOPP (durable plastic) ----
  {
    slug: 'matte-bopp',
    name: 'Matte BOPP Film',
    category: 'FILM_BOPP',
    description: 'Synthetic film with a matte finish. Water-resistant and tear-resistant.',
    baseUnitCostCents: 5,
    finishCompatibility: ['flood-uv', 'spot-uv-gloss', 'foil-stamping'],
  },
  {
    slug: 'gloss-bopp',
    name: 'Gloss BOPP Film',
    category: 'FILM_BOPP',
    description: 'High-shine durable plastic film. Industry standard for beverages and personal care.',
    baseUnitCostCents: 6,
    finishCompatibility: ['flood-uv', 'spot-uv-gloss', 'foil-stamping'],
  },

  // ---- FILM_CLEAR ("no label" look) ----
  {
    slug: 'clear-bopp',
    name: 'Clear BOPP Film',
    category: 'FILM_CLEAR',
    description: 'Transparent film for the no-label look. Pair with white ink for solid elements.',
    baseUnitCostCents: 8,
    finishCompatibility: ['flood-uv', 'spot-uv-gloss', 'white-ink'],
  },

  // ---- FILM_METALLIC (premium foil substrate) ----
  {
    slug: 'silver-foil',
    name: 'Silver Foil Substrate',
    category: 'FILM_METALLIC',
    description: 'Silver metallic film substrate. Letters and shapes show foil-finish without dies.',
    baseUnitCostCents: 14,
    finishCompatibility: ['flood-uv', 'spot-uv-gloss'],
  },

  // ---- SPECIALTY ----
  {
    slug: 'wood-grain',
    name: 'Wood-Grain Specialty',
    category: 'SPECIALTY',
    description: 'Wood-grain printed substrate. Craft / boutique aesthetic without real wood cost.',
    baseUnitCostCents: 11,
  },
  {
    slug: 'fabric-textile',
    name: 'Fabric Textile',
    category: 'SPECIALTY',
    description: 'Woven fabric label substrate. Premium feel for cosmetics / wellness.',
    baseUnitCostCents: 19,
  },
]

interface PackagingMaterialSeed {
  slug: string
  name: string
  topology: PackagingTopology
  description: string
  baseUnitCostCents: number
  foodSafe?: boolean
  sustainabilityTier?: SustainabilityTier
}

const PACKAGING_MATERIALS: PackagingMaterialSeed[] = [
  // ---- SINGLE_CONTAINER — bottle / jar / can ----
  {
    slug: 'pet-bottle',
    name: 'PET Plastic Bottle',
    topology: 'SINGLE_CONTAINER',
    description: 'Standard PET plastic — clear, lightweight, recyclable.',
    baseUnitCostCents: 22,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'hdpe-bottle',
    name: 'HDPE Plastic Bottle',
    topology: 'SINGLE_CONTAINER',
    description: 'High-density polyethylene — opaque, durable, recyclable.',
    baseUnitCostCents: 24,
  },
  {
    slug: 'glass-bottle-amber',
    name: 'Amber Glass Bottle',
    topology: 'SINGLE_CONTAINER',
    description: 'UV-protective amber glass. Premium feel, infinitely recyclable.',
    baseUnitCostCents: 78,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'glass-bottle-clear',
    name: 'Clear Glass Bottle',
    topology: 'SINGLE_CONTAINER',
    description: 'Crystal-clear glass. Showcases color of contents.',
    baseUnitCostCents: 76,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'aluminum-bottle',
    name: 'Aluminum Bottle',
    topology: 'SINGLE_CONTAINER',
    description: 'Lightweight aluminum. Infinitely recyclable, popular in beverages.',
    baseUnitCostCents: 91,
    sustainabilityTier: 'RECYCLED',
  },

  // ---- CAPSULE_JAR — supplement bottles ----
  {
    slug: 'capsule-bottle-amber',
    name: 'Amber Supplement Bottle',
    topology: 'CAPSULE_JAR',
    description: 'Amber HDPE capsule bottle. Standard for supplements.',
    baseUnitCostCents: 38,
  },
  {
    slug: 'capsule-bottle-glass',
    name: 'Glass Supplement Bottle',
    topology: 'CAPSULE_JAR',
    description: 'Glass capsule bottle. Premium feel; heavier shipping.',
    baseUnitCostCents: 96,
    sustainabilityTier: 'RECYCLED',
  },

  // ---- POUCH_STAND_UP ----
  {
    slug: 'kraft-pouch',
    name: 'Kraft Stand-Up Pouch',
    topology: 'POUCH_STAND_UP',
    description: 'Brown kraft stand-up pouch with zipper. Craft / natural look.',
    baseUnitCostCents: 19,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'foil-lined-pouch',
    name: 'Foil-Lined Pouch',
    topology: 'POUCH_STAND_UP',
    description: 'Multi-layer foil-lined pouch. Best barrier protection for perishables.',
    baseUnitCostCents: 28,
  },
  {
    slug: 'clear-pouch',
    name: 'Clear Pouch',
    topology: 'POUCH_STAND_UP',
    description: 'Transparent stand-up pouch. Showcases product.',
    baseUnitCostCents: 21,
  },
  {
    slug: 'compostable-pouch',
    name: 'Compostable Pouch',
    topology: 'POUCH_STAND_UP',
    description: 'BPI-certified compostable pouch. Decomposes in commercial facilities.',
    baseUnitCostCents: 41,
    sustainabilityTier: 'COMPOSTABLE',
  },

  // ---- POUCH_FLAT / SACHET / STICK_PACK ----
  {
    slug: 'foil-sachet',
    name: 'Foil Sachet',
    topology: 'SACHET',
    description: 'Single-serve foil sachet. Beverage powders, supplements.',
    baseUnitCostCents: 8,
  },
  {
    slug: 'paper-stick-pack',
    name: 'Paper Stick Pack',
    topology: 'STICK_PACK',
    description: 'Single-serve paper-blend stick. Eco alternative to foil sachets.',
    baseUnitCostCents: 9,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'foil-stick-pack',
    name: 'Foil Stick Pack',
    topology: 'STICK_PACK',
    description: 'Foil stick pack. Premium barrier, single-serve dose.',
    baseUnitCostCents: 11,
  },

  // ---- MULTI_CONTAINER_BOX / CASE ----
  {
    slug: 'kraft-carton',
    name: 'Kraft Carton',
    topology: 'MULTI_CONTAINER_BOX',
    description: 'Recycled kraft outer carton. Natural craft aesthetic.',
    baseUnitCostCents: 34,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'white-carton',
    name: 'White SBS Carton',
    topology: 'MULTI_CONTAINER_BOX',
    description: 'Solid bleached sulfate paperboard. Crisp white, premium feel.',
    baseUnitCostCents: 38,
  },
  {
    slug: 'corrugated-shipper',
    name: 'Corrugated Shipper',
    topology: 'CASE',
    description: 'Standard corrugated shipper. Holds 12 or 24 inner units.',
    baseUnitCostCents: 18,
    sustainabilityTier: 'RECYCLED',
  },

  // ---- TUBE ----
  {
    slug: 'aluminum-tube',
    name: 'Aluminum Squeeze Tube',
    topology: 'TUBE',
    description: 'Aluminum squeeze tube for gels / sauces / topicals.',
    baseUnitCostCents: 44,
    sustainabilityTier: 'RECYCLED',
  },
  {
    slug: 'plastic-tube',
    name: 'Plastic Squeeze Tube',
    topology: 'TUBE',
    description: 'PE/PP squeeze tube. Lower cost than aluminum.',
    baseUnitCostCents: 28,
  },
]

export async function seedProductionOptions(prisma: PrismaClient): Promise<void> {
  for (const s of SUBSTRATES) {
    await prisma.substrate.upsert({
      where: { slug: s.slug },
      create: {
        slug: s.slug,
        name: s.name,
        category: s.category,
        description: s.description,
        baseUnitCostCents: s.baseUnitCostCents,
        sustainabilityTier: s.sustainabilityTier ?? 'STANDARD',
        finishCompatibility: s.finishCompatibility ?? [],
        status: 'ACTIVE',
      },
      update: {
        name: s.name,
        category: s.category,
        description: s.description,
        baseUnitCostCents: s.baseUnitCostCents,
        sustainabilityTier: s.sustainabilityTier ?? 'STANDARD',
        finishCompatibility: s.finishCompatibility ?? [],
      },
    })
  }
  for (const m of PACKAGING_MATERIALS) {
    await prisma.packagingMaterial.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: m.name,
        topology: m.topology,
        description: m.description,
        baseUnitCostCents: m.baseUnitCostCents,
        foodSafe: m.foodSafe ?? true,
        sustainabilityTier: m.sustainabilityTier ?? 'STANDARD',
        status: 'ACTIVE',
      },
      update: {
        name: m.name,
        topology: m.topology,
        description: m.description,
        baseUnitCostCents: m.baseUnitCostCents,
        foodSafe: m.foodSafe ?? true,
        sustainabilityTier: m.sustainabilityTier ?? 'STANDARD',
      },
    })
  }
  console.log(
    `  ✓ Seeded ${SUBSTRATES.length} substrates + ${PACKAGING_MATERIALS.length} packaging materials`,
  )
}
