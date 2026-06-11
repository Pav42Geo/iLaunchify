import 'server-only'
import { prisma } from '@ilaunchify/db'
import type { SampleOption } from './sample-quote'

/**
 * Marketplace product-detail sample policy (Pavel 2026-06-10).
 *
 * For a ProductTemplate slug, return the ENABLED sample options the partner
 * offers (UNBRANDED / BRANDED), the orderable flavor pool, and a dieline-ready
 * gate for branded samples. Empty options → the "Order a sample" card hides.
 *
 * Cast-guarded: ProductSampleOption lands on the generated client only after the
 * sample-policy migration, so reads are wrapped and failures degrade to empty.
 */

export interface ProductSampleData {
  options: SampleOption[] // enabled only
  flavorNames: string[] // orderable flavor pool ([] / one entry for single-flavor)
  isMultiFlavor: boolean
  /** Gates BRANDED — a packaging-proof sample can't be made until the dieline clears. */
  dielineReady: boolean
}

const EMPTY: ProductSampleData = { options: [], flavorNames: [], isMultiFlavor: false, dielineReady: false }

export async function getProductSampleOptions(templateSlug: string): Promise<ProductSampleData> {
  try {
    const row = await (prisma as unknown as {
      productTemplate: {
        findUnique: (a: unknown) => Promise<{
          sampleOptions: Array<{
            kind: 'UNBRANDED' | 'BRANDED'
            perFlavorCents: number | null
            samplerSetCents: number | null
            sampleMoq: number
            maxUnitsPerFlavor: number | null
            leadTimeDays: number
            creditTowardFirstOrder: boolean
            creditCapCents: number | null
          }>
          flavorPresets: Array<{ name: string }>
        } | null>
      }
    }).productTemplate
      .findUnique({
        where: { slug: templateSlug },
        select: {
          sampleOptions: {
            where: { enabled: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              kind: true,
              perFlavorCents: true,
              samplerSetCents: true,
              sampleMoq: true,
              maxUnitsPerFlavor: true,
              leadTimeDays: true,
              creditTowardFirstOrder: true,
              creditCapCents: true,
            },
          },
          flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true } },
        },
      })
      .catch(() => null)

    if (!row) return EMPTY

    const options: SampleOption[] = (row.sampleOptions ?? []).map((s) => ({
      kind: s.kind,
      perFlavorCents: s.perFlavorCents,
      samplerSetCents: s.samplerSetCents,
      sampleMoq: s.sampleMoq,
      maxUnitsPerFlavor: s.maxUnitsPerFlavor,
      leadTimeDays: s.leadTimeDays,
      creditTowardFirstOrder: s.creditTowardFirstOrder,
      creditCapCents: s.creditCapCents,
    }))
    const flavorNames = (row.flavorPresets ?? []).map((f) => f.name).filter((n): n is string => !!n && n.trim().length > 0)

    // Dieline-readiness for BRANDED samples. The dieline frame editor + its
    // verified-status signal aren't wired yet (builder Step 4, #36), so this
    // defaults locked. Replace with the real "dieline passed compliance" check
    // when that flow lands — the card already handles the locked state.
    const dielineReady = false

    return { options, flavorNames, isMultiFlavor: flavorNames.length > 1, dielineReady }
  } catch (err) {
    console.warn('[product-sample-options] getProductSampleOptions failed:', (err as Error).message)
    return EMPTY
  }
}
