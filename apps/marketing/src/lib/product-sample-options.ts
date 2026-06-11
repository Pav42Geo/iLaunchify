import 'server-only'
import { prisma, getSampleSettings } from '@ilaunchify/db'
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

    // Branded-sample availability, admin-controlled (SampleSettings). When the
    // admin requires an approved die-line for branded samples, the card shows a
    // locked state; otherwise branded is available now (partners supply packaging
    // out-of-band until the die-line flow ships, #36).
    const dielineReady = !(await getSampleSettings()).brandedRequiresDieline

    return { options, flavorNames, isMultiFlavor: flavorNames.length > 1, dielineReady }
  } catch (err) {
    console.warn('[product-sample-options] getProductSampleOptions failed:', (err as Error).message)
    return EMPTY
  }
}

/**
 * Whether the signed-in creator already owns a Product for this template (samples
 * require an existing product, per the locked attachment model). Returns the
 * product id to deep-link the sample checkout, or null (guide them to customise).
 */
export async function getOwnedSampleProductId(templateSlug: string, userId: string): Promise<string | null> {
  try {
    const owned = await prisma.product.findFirst({
      where: { productTemplate: { slug: templateSlug }, brand: { creatorProfile: { userId } } },
      select: { id: true },
    })
    return owned?.id ?? null
  } catch (err) {
    console.warn('[product-sample-options] getOwnedSampleProductId failed:', (err as Error).message)
    return null
  }
}
