// Seed — SpotColor reference catalog (C9). A curated starter set of well-known
// PANTONE spot colors + the special process channels (white ink / spot varnish /
// foil) the export bundle's spec sheet references.
//
// ⚠️ The CMYK + RGB values are widely-cited APPROXIMATIONS for on-screen
// soft-proofing only. PANTONE is a proprietary spot system — the printed result
// is defined by the PMS reference, never by these numbers. The schema comments
// and the eventual picker must say so. Idempotent (upsert by fullSpec).

import { PrismaClient } from '@prisma/client'
import type { PmsBook, SpotColorCategory } from '@prisma/client'

interface Cmyk {
  c: number
  m: number
  y: number
  k: number
}
interface SpotSeed {
  pmsNumber: string
  bookVersion: PmsBook
  fullSpec: string
  cmyk: Cmyk
  rgb: string
  category: SpotColorCategory
}

// Common coated (C) PANTONE solids — brand staples.
const STANDARD_C: Array<{ pms: string; rgb: string; cmyk: Cmyk }> = [
  { pms: '185', rgb: '#E4002B', cmyk: { c: 0, m: 91, y: 76, k: 0 } },
  { pms: '186', rgb: '#C8102E', cmyk: { c: 2, m: 100, y: 85, k: 6 } },
  { pms: '032', rgb: '#EF3340', cmyk: { c: 0, m: 90, y: 86, k: 0 } },
  { pms: '021', rgb: '#FE5000', cmyk: { c: 0, m: 73, y: 100, k: 0 } },
  { pms: '144', rgb: '#ED8B00', cmyk: { c: 0, m: 51, y: 100, k: 0 } },
  { pms: '109', rgb: '#FFD100', cmyk: { c: 0, m: 9, y: 100, k: 0 } },
  { pms: '376', rgb: '#84BD00', cmyk: { c: 54, m: 0, y: 100, k: 0 } },
  { pms: '355', rgb: '#009639', cmyk: { c: 91, m: 0, y: 100, k: 0 } },
  { pms: '348', rgb: '#00843D', cmyk: { c: 96, m: 2, y: 100, k: 12 } },
  { pms: '3415', rgb: '#006F51', cmyk: { c: 92, m: 7, y: 71, k: 30 } },
  { pms: '2925', rgb: '#009CDE', cmyk: { c: 85, m: 24, y: 0, k: 0 } },
  { pms: '300', rgb: '#005EB8', cmyk: { c: 100, m: 44, y: 0, k: 0 } },
  { pms: '286', rgb: '#0033A0', cmyk: { c: 100, m: 75, y: 0, k: 0 } },
  { pms: '072', rgb: '#10069F', cmyk: { c: 100, m: 88, y: 0, k: 5 } },
  { pms: '269', rgb: '#512D6D', cmyk: { c: 73, m: 94, y: 0, k: 29 } },
  { pms: '254', rgb: '#A4248E', cmyk: { c: 45, m: 95, y: 0, k: 0 } },
  { pms: 'Warm Red', rgb: '#F9423A', cmyk: { c: 0, m: 80, y: 73, k: 0 } },
  { pms: 'Cool Gray 11', rgb: '#53565A', cmyk: { c: 0, m: 2, y: 0, k: 68 } },
  { pms: 'Cool Gray 6', rgb: '#A7A8AA', cmyk: { c: 0, m: 1, y: 0, k: 37 } },
  { pms: 'Process Black', rgb: '#2D2926', cmyk: { c: 0, m: 0, y: 0, k: 100 } },
]

// A few uncoated (U) variants of the most-used brand colors.
const STANDARD_U: Array<{ pms: string; rgb: string; cmyk: Cmyk }> = [
  { pms: '185', rgb: '#E03C31', cmyk: { c: 0, m: 87, y: 75, k: 0 } },
  { pms: '286', rgb: '#1F4E9E', cmyk: { c: 100, m: 72, y: 0, k: 2 } },
  { pms: '348', rgb: '#3D8E5B', cmyk: { c: 86, m: 8, y: 86, k: 12 } },
  { pms: '109', rgb: '#FFD43B', cmyk: { c: 0, m: 11, y: 96, k: 0 } },
]

// Neon (fluorescent) book.
const NEON: Array<{ pms: string; rgb: string; cmyk: Cmyk }> = [
  { pms: '802', rgb: '#44D62C', cmyk: { c: 64, m: 0, y: 100, k: 0 } },
  { pms: '803', rgb: '#FFE900', cmyk: { c: 1, m: 0, y: 92, k: 0 } },
  { pms: '805', rgb: '#FF6D70', cmyk: { c: 0, m: 65, y: 45, k: 0 } },
  { pms: '806', rgb: '#FF0F9B', cmyk: { c: 0, m: 78, y: 0, k: 0 } },
]

// Metallic book.
const METALLIC: Array<{ pms: string; rgb: string; cmyk: Cmyk }> = [
  { pms: '877', rgb: '#8A8D8F', cmyk: { c: 0, m: 0, y: 0, k: 50 } }, // silver
  { pms: '871', rgb: '#84754E', cmyk: { c: 20, m: 30, y: 70, k: 30 } }, // gold
  { pms: '8003', rgb: '#9F7B53', cmyk: { c: 25, m: 45, y: 70, k: 25 } }, // copper
]

// Special process channels — no PANTONE book; the spec sheet names these so the
// printer sets up the right plate/station. bookVersion COATED is a placeholder.
const SPECIAL: Array<{ name: string; rgb: string; cmyk: Cmyk; category: SpotColorCategory }> = [
  { name: 'White Ink', rgb: '#FFFFFF', cmyk: { c: 0, m: 0, y: 0, k: 0 }, category: 'WHITE_INK' },
  { name: 'Spot UV Varnish', rgb: '#D9D9D9', cmyk: { c: 0, m: 0, y: 0, k: 0 }, category: 'SPOT_VARNISH' },
  { name: 'Silver Foil', rgb: '#C0C0C0', cmyk: { c: 0, m: 0, y: 0, k: 25 }, category: 'FOIL' },
  { name: 'Gold Foil', rgb: '#D4AF37', cmyk: { c: 15, m: 25, y: 85, k: 10 }, category: 'FOIL' },
  { name: 'Rose Gold Foil', rgb: '#B76E79', cmyk: { c: 10, m: 55, y: 35, k: 5 }, category: 'FOIL' },
  { name: 'Holographic Foil', rgb: '#CFE8E0', cmyk: { c: 18, m: 0, y: 8, k: 0 }, category: 'FOIL' },
]

function buildRows(): SpotSeed[] {
  const rows: SpotSeed[] = []
  for (const s of STANDARD_C)
    rows.push({ pmsNumber: s.pms, bookVersion: 'COATED', fullSpec: `PMS ${s.pms} C`, cmyk: s.cmyk, rgb: s.rgb, category: 'STANDARD' })
  for (const s of STANDARD_U)
    rows.push({ pmsNumber: s.pms, bookVersion: 'UNCOATED', fullSpec: `PMS ${s.pms} U`, cmyk: s.cmyk, rgb: s.rgb, category: 'STANDARD' })
  for (const s of NEON)
    rows.push({ pmsNumber: s.pms, bookVersion: 'NEON', fullSpec: `PMS ${s.pms} (Neon)`, cmyk: s.cmyk, rgb: s.rgb, category: 'NEON' })
  for (const s of METALLIC)
    rows.push({ pmsNumber: s.pms, bookVersion: 'METALLIC', fullSpec: `PMS ${s.pms} (Metallic)`, cmyk: s.cmyk, rgb: s.rgb, category: 'METALLIC' })
  for (const s of SPECIAL)
    rows.push({ pmsNumber: s.name, bookVersion: 'COATED', fullSpec: s.name, cmyk: s.cmyk, rgb: s.rgb, category: s.category })
  return rows
}

export async function seedSpotColors(prisma: PrismaClient): Promise<void> {
  const rows = buildRows()
  for (const r of rows) {
    await prisma.spotColor.upsert({
      where: { fullSpec: r.fullSpec },
      create: {
        pmsNumber: r.pmsNumber,
        bookVersion: r.bookVersion,
        fullSpec: r.fullSpec,
        cmykApprox: r.cmyk,
        rgbApprox: r.rgb,
        category: r.category,
      },
      update: {
        pmsNumber: r.pmsNumber,
        bookVersion: r.bookVersion,
        cmykApprox: r.cmyk,
        rgbApprox: r.rgb,
        category: r.category,
      },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`  ✓ Seeded ${rows.length} spot colors (approximations — soft-proof only)`)
}

// Standalone run: `tsx prisma/seed-spot-colors.ts`
if (process.argv[1]?.endsWith('seed-spot-colors.ts')) {
  const prisma = new PrismaClient()
  seedSpotColors(prisma)
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
