'use server'

// B4 — admin routing-preview action. Runs the real manufacturer gates + scoring
// (previewManufacturerMatches) so ops can see why the engine picks a partner.

import { requireRole } from '@ilaunchify/auth'
import { previewManufacturerMatches, type RoutingPreviewResult } from '@ilaunchify/orders'

export async function runRoutingPreview(input: {
  productId: string
  quantity: number
  destinationRegionId?: string | null
  destinationCountry?: string | null
  targetMarketId?: string | null
}): Promise<{ ok: true; data: RoutingPreviewResult } | { ok: false; error: string }> {
  await requireRole('ADMIN')
  if (!input.productId) return { ok: false, error: 'Pick a product.' }
  const qty = Math.max(1, Math.floor(input.quantity || 0))
  const res = await previewManufacturerMatches({
    productId: input.productId,
    quantity: qty,
    destinationRegionId: input.destinationRegionId ?? null,
    destinationCountry: input.destinationCountry ?? null,
    targetMarketId: input.targetMarketId ?? null,
  })
  if ('error' in res) return { ok: false, error: res.error }
  return { ok: true, data: res }
}
