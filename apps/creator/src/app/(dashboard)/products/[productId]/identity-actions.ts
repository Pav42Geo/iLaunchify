'use server'

// Server actions for the product Retail Identity card (DS-52c) — saving +
// validating GTINs, internal SKUs, and barcode mode.
//
// Cross-product duplicate detection is privacy-safe: we never disclose the
// brand or product that already holds a GTIN, just "in use elsewhere on
// iLaunchify" — the creator can take it up with GS1 if they think they own
// it.

import { revalidatePath } from 'next/cache'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { validateGtin } from '@ilaunchify/ui'

export type BarcodeMode = 'NONE' | 'RETAIL_UPC' | 'INTERNAL_SKU'

export interface IdentityCheck {
  ok: boolean
  /** Normalized digit string when GTIN is well-formed (regardless of duplicate). */
  normalized?: string
  format?: string
  errors: {
    field: 'gtin' | 'internalSku' | 'barcodeMode'
    message: string
  }[]
  warnings: {
    field: 'gtin' | 'internalSku'
    message: string
  }[]
}

/**
 * Validate without saving — used by the client component to surface inline
 * hints as the creator types. Cheap (no write side effects).
 */
export async function checkIdentity(
  productId: string,
  input: { gtin?: string | null; internalSku?: string | null; barcodeMode?: BarcodeMode },
): Promise<IdentityCheck> {
  const errors: IdentityCheck['errors'] = []
  const warnings: IdentityCheck['warnings'] = []
  let normalized: string | undefined
  let format: string | undefined

  if (input.gtin && input.gtin.trim()) {
    const v = validateGtin(input.gtin)
    if (!v.ok) {
      if (v.reason === 'wrong-length') {
        errors.push({
          field: 'gtin',
          message:
            'GTIN must be 8, 12, 13, or 14 digits (EAN-8, UPC-A, EAN-13, ITF-14).',
        })
      } else if (v.reason === 'non-numeric') {
        errors.push({ field: 'gtin', message: 'GTIN must be numeric — no letters.' })
      } else if (v.reason === 'bad-check-digit') {
        errors.push({
          field: 'gtin',
          message:
            'Check digit doesn\'t match — confirm the GTIN with your GS1 record.',
        })
        normalized = v.normalized
        format = v.format
      }
    } else {
      normalized = v.normalized
      format = v.format

      // Duplicate detection across the platform — privacy-safe.
      const collision = await prisma.product.findFirst({
        where: {
          gtin: normalized,
          NOT: { id: productId },
        },
        select: { id: true },
      })
      if (collision) {
        warnings.push({
          field: 'gtin',
          message:
            'This GTIN is already in use by another product on iLaunchify. If you own it via GS1, contact support to resolve.',
        })
      }
    }
  }

  if (input.barcodeMode === 'RETAIL_UPC' && (!input.gtin || !input.gtin.trim())) {
    errors.push({
      field: 'barcodeMode',
      message: 'Retail UPC mode needs a valid GTIN above.',
    })
  }
  if (
    input.barcodeMode === 'INTERNAL_SKU' &&
    (!input.internalSku || !input.internalSku.trim())
  ) {
    errors.push({
      field: 'barcodeMode',
      message: 'Internal SKU mode needs a SKU value above.',
    })
  }
  if (input.internalSku && input.internalSku.length > 64) {
    errors.push({
      field: 'internalSku',
      message: 'Keep SKUs to 64 characters or fewer.',
    })
  }

  return { ok: errors.length === 0, normalized, format, errors, warnings }
}

export interface SaveResult {
  ok: true
}

export interface SaveError {
  ok: false
  errors: IdentityCheck['errors']
  warnings: IdentityCheck['warnings']
}

export async function saveProductIdentity(
  productId: string,
  input: {
    gtin: string | null
    internalSku: string | null
    barcodeMode: BarcodeMode
  },
): Promise<SaveResult | SaveError> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: { id: true },
  })
  if (!product) {
    return {
      ok: false,
      errors: [{ field: 'gtin', message: 'Product not found or access denied.' }],
      warnings: [],
    }
  }

  const check = await checkIdentity(productId, input)
  if (!check.ok) {
    return { ok: false, errors: check.errors, warnings: check.warnings }
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      gtin: check.normalized ?? null,
      gtinSource: 'USER_PROVIDED',
      internalSku: input.internalSku?.trim() || null,
      barcodeMode: input.barcodeMode,
    },
  })

  revalidatePath(`/products/${productId}`)
  return { ok: true }
}
