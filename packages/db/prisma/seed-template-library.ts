/**
 * Seed an initial Design Template Library (docs/DESIGN_TEMPLATE_LIBRARY.md §9.6) so the
 * creator library isn't empty before designers produce real artwork. Generates simple,
 * recolor-ready starter designs (background + heading + subtitle) for a handful of
 * (domain × die-line × style) combinations, tagged with domain + primary style + die-line
 * targeting + colorRoles. Idempotent: clears prior "Starter ·" templates first.
 *
 * Run: `pnpm --filter @ilaunchify/db seed:template-library`
 * (Needs listActiveDieCuts + TemplateStyle seeded first.)
 */
import { PrismaClient } from '@prisma/client'

const SEED_PREFIX = 'Starter · '
const PX_PER_MM = 3

type Domain = 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'COSMETIC'
const DOMAINS: Domain[] = ['FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'COSMETIC']

const CATEGORY_TO_CONTAINER: Record<string, string> = {
  BOTTLE_WRAP: 'BOTTLE',
  TUB_LID: 'JAR',
  POUCH_FRONT: 'POUCH',
  BOX_PANEL: 'BOX',
  STICKER: 'OTHER',
  CUSTOM: 'OTHER',
}

// Curated starter palettes [background, primary, accent], cycled across templates.
const PALETTES: Array<[string, string, string]> = [
  ['#F3EFE8', '#1A1A1A', '#FF2E63'],
  ['#0E1116', '#F4F4F5', '#B5FF3D'],
  ['#FBF7F0', '#2D3A2E', '#C08457'],
  ['#FFFFFF', '#0F2C59', '#3DA5D9'],
  ['#FFF1F2', '#7A1F3D', '#E8A0BF'],
  ['#101820', '#FEE715', '#FEE715'],
]

function aspectBucket(w: number, h: number): string | null {
  if (!w || !h) return null
  const r = w / h
  if (r >= 2.5) return 'WRAP'
  if (r >= 1.3) return 'PANEL_WIDE'
  if (r >= 0.8) return 'PANEL_SQUARE'
  if (r >= 0.3) return 'PANEL_TALL'
  return 'LONG_STRIP'
}

interface DieCut {
  id: string
  name: string
  category: string
  widthMm: number
  heightMm: number
  bleedMm: number
}

/** Build a minimal, recolor-ready Fabric JSON + its colorRoles map. */
function buildStarter(
  dieCut: DieCut,
  palette: [string, string, string],
  heading: string,
  subtitle: string,
): { canvasJson: string; colorRoles: Record<string, string> } {
  const [bg, primary, accent] = palette
  const fullW = (dieCut.widthMm + 2 * dieCut.bleedMm) * PX_PER_MM
  const fullH = (dieCut.heightMm + 2 * dieCut.bleedMm) * PX_PER_MM
  const cx = fullW / 2
  const cy = fullH / 2
  const headingSize = Math.max(18, Math.round(Math.min(fullW, fullH) * 0.12))
  const subSize = Math.max(10, Math.round(headingSize * 0.42))

  const objects = [
    { type: 'rect', left: 0, top: 0, width: fullW, height: fullH, fill: bg, selectable: true, evented: true },
    {
      type: 'i-text',
      text: heading,
      left: cx,
      top: cy - headingSize * 0.6,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter',
      fontWeight: 'bold',
      fontSize: headingSize,
      fill: primary,
      textAlign: 'center',
    },
    {
      type: 'i-text',
      text: subtitle,
      left: cx,
      top: cy + headingSize * 0.7,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter',
      fontSize: subSize,
      fill: accent,
      textAlign: 'center',
    },
  ]
  const canvasJson = JSON.stringify({ version: '6.5.1', objects })
  const colorRoles: Record<string, string> = {
    [bg.toUpperCase()]: 'background',
    [primary.toUpperCase()]: 'primary',
    [accent.toUpperCase()]: 'accent',
  }
  return { canvasJson, colorRoles }
}

interface SeedDelegates {
  brandTemplate: {
    deleteMany: (a: unknown) => Promise<unknown>
    create: (a: unknown) => Promise<{ id: string }>
  }
  templateStyle: { findMany: (a: unknown) => Promise<Array<{ id: string; label: string }>> }
  templateStyleAssignment: { create: (a: unknown) => Promise<unknown> }
  dieCutTemplate: {
    findMany: (a: unknown) => Promise<DieCut[]>
  }
}

export async function seedTemplateLibrary(prisma: PrismaClient) {
  const p = prisma as unknown as SeedDelegates
  const getBrand = (prisma as unknown as {
    brand: { findUnique: (a: unknown) => Promise<{ id: string } | null> }
  }).brand

  const systemBrand = await getBrand.findUnique({ where: { handle: 'ilaunchify-templates' }, select: { id: true } })
  if (!systemBrand) {
    console.log('  template library: system templates brand missing — run the main seed first. Skipping.')
    return
  }
  const brandId = systemBrand.id

  const dieCuts = await p.dieCutTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    take: 2,
    select: { id: true, name: true, category: true, widthMm: true, heightMm: true, bleedMm: true },
  })
  if (dieCuts.length === 0) {
    console.log('  template library: no active die-cuts — skipping starter templates.')
    return
  }

  // Idempotent: clear prior starters (style assignments cascade on delete).
  await p.brandTemplate.deleteMany({ where: { brandId, name: { startsWith: SEED_PREFIX } } })

  let made = 0
  let paletteIdx = 0
  for (const domain of DOMAINS) {
    const styles = await p.templateStyle.findMany({
      where: { domain, active: true, facet: 'AESTHETIC' },
      orderBy: { sortOrder: 'asc' },
      take: 5,
      select: { id: true, label: true },
    })
    for (const style of styles) {
      for (const dieCut of dieCuts) {
        const palette = PALETTES[paletteIdx % PALETTES.length]!
        paletteIdx += 1
        const isPremium = paletteIdx % 3 === 0
        const { canvasJson, colorRoles } = buildStarter(dieCut, palette, 'Brand Name', style.label)
        const created = await p.brandTemplate.create({
          data: {
            brandId,
            name: `${SEED_PREFIX}${style.label} · ${dieCut.name}`,
            canvasJson,
            thumbnailUrl: null,
            isPremium,
            tier: isPremium ? 'agency' : null,
            colorRoles,
            domain,
            matchMode: 'SHAPE_FAMILY',
            targetContainerCategory: CATEGORY_TO_CONTAINER[dieCut.category] ?? null,
            aspectBucket: aspectBucket(dieCut.widthMm, dieCut.heightMm),
          },
          select: { id: true },
        })
        await p.templateStyleAssignment.create({
          data: { templateId: created.id, styleId: style.id, isPrimary: true },
        })
        made += 1
      }
    }
    console.log(`  template library · ${domain}: ${styles.length} styles × ${dieCuts.length} die-cuts`)
  }
  console.log(`✓ Seeded ${made} starter library templates.`)
}

if (process.argv[1] && process.argv[1].endsWith('seed-template-library.ts')) {
  const prisma = new PrismaClient()
  seedTemplateLibrary(prisma)
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => void prisma.$disconnect())
}
