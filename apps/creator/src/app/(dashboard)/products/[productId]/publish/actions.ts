'use server'

import { prisma, listPaymentMethodRefs } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, variantKey, applyLedgerEntry, type ChannelCode, type ListingVariantInput } from '@ilaunchify/channels'
import {
  configurationChannelVariants,
  isCurrentConfiguration,
  loadOnDemandEligibility,
  describeOnDemandIneligibility,
  ON_DEMAND_INELIGIBLE_COPY,
} from '@ilaunchify/orders'
import { recomputeStockAlert } from '../../../channels/inventory/alerts'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const Schema = z.object({
  productId: z.string(),
  priceCents: z.number().int().positive(),
  inventoryAvailable: z.number().int().positive().nullable(),
})

export async function publishProduct(input: z.infer<typeof Schema>) {
  const user = await requireUser()
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: parsed.error.errors[0]?.message ?? 'Invalid input' }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, brand: { creatorProfile: { userId: user.id } } },
    include: {
      recipe: {
        include: { complianceChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
    },
  })
  if (!product) return { ok: false as const, error: 'Product not found' }

  const lastCheck = product.recipe?.complianceChecks[0]
  if (!lastCheck || lastCheck.outcome === 'FAILED') {
    return {
      ok: false as const,
      error: 'Compliance violations must be resolved before publishing',
    }
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      priceCents: parsed.data.priceCents,
      inventoryAvailable: parsed.data.inventoryAvailable,
      status: 'PUBLISHED',
    },
  })

  revalidatePath(`/products/${product.id}`)
  return { ok: true as const }
}

// =============================================================================
// Sell-to-channel actions (CHANNEL_MANAGEMENT_SPEC §3.4, Phase C0).
// Configure a listing per connected channel (mode + price), then PUSH it through
// the ChannelAdapter seam (stub in dev; real adapters per phase C1+). Variant
// links (the mapping atom) are written on push.
// =============================================================================

async function logSync(connectionId: string, topic: string, outcome: 'OK' | 'ERROR', detail?: string) {
  // Best-effort telemetry: a failed log write must never affect the push.
  await prisma.channelSyncEvent
    .create({ data: { channelConnectionId: connectionId, direction: 'PUSH', topic, outcome, detail: detail ?? null } })
    .catch(() => {})
}

export interface SellChannelRow {
  channelId: string
  code: string
  displayName: string
  connectionId: string
  externalAccountId: string | null
  link: {
    id: string
    mode: string
    price: string | null
    publishState: string
    externalListingId: string | null
    externalUrl: string | null
    lastError: string | null
  } | null
}

export interface SellData {
  productName: string
  /** Production unit cost in cents (what the creator pays): margin-hint baseline. */
  unitCostCents: number
  flavors: Array<{ id: string; name: string }>
  channels: SellChannelRow[]
  /** On-demand gate state for THIS product (LOCKED gate #1): the pinned
   *  manufacturer's enablement. 'NONE' = never requested; null manufacturer =
   *  product has no pinned manufacturer yet (can't request). */
  onDemand: {
    status: string
    hasManufacturer: boolean
    partnerNote: string | null
    /** Full-service gate (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md):
     *  the pinned manufacturer must execute the whole order in-house. When
     *  ineligible, `blockers` carries the creator-facing reasons. */
    eligible: boolean
    blockers: string[]
    /** C2.2 go-live gate: a chargeable saved method must be on file before an
     *  ON_DEMAND listing goes LIVE (per-consumer-order auto-billing). */
    paymentMethodOnFile: boolean
  }
  /** Bulk stock (gate #2): the CREATOR-location pool for this product. */
  stock: { onHand: number; reserved: number; available: number }
}

/** Everything the Sell section needs: connected channels + per-channel listing state. */
export async function loadSellData(productId: string): Promise<SellData | null> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      priceCents: true,
      productTemplateId: true,
      productTemplate: { select: { manufacturerServiceId: true } },
    },
  })
  if (!product) return null

  const manufacturerServiceId = product.productTemplate?.manufacturerServiceId ?? null
  // Scoped to the PINNED manufacturer (2026-07-16). OnDemandEnablement is keyed
  // @@unique([creatorUserId, productId, manufacturerServiceId]) because it is ONE
  // manufacturer's agreement to produce THIS branding. Without the third key a
  // re-pin carries consent across: pin to A, A approves, re-pin to B, and B reads
  // as ENABLED on A's agreement. `manufacturerServiceId` was already loaded on the
  // line above and simply not used here.
  // No pinned manufacturer => no valid enablement => null => the gate stays shut.
  const enablement = manufacturerServiceId
    ? await prisma.onDemandEnablement.findFirst({
        where: { creatorUserId: user.id, productId, manufacturerServiceId },
        select: { status: true, partnerNote: true },
      })
    : null

  const [connections, links, flavors] = await Promise.all([
    prisma.channelConnection.findMany({
      where: { creatorUserId: user.id, status: 'CONNECTED' },
      include: { channel: true },
    }),
    prisma.channelProductLink.findMany({ where: { productId } }),
    product.productTemplateId
      ? prisma.flavorPreset.findMany({
          where: { productTemplateId: product.productTemplateId, status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  // Full-service gate for the Sell surface: the UI disables the on-demand mode
  // + request button and explains why, instead of failing on submit.
  const eligibility = await loadOnDemandEligibility(product.id, user.id).catch(
    () => ({ eligible: false, reasons: ['NO_PINNED_MANUFACTURER'] }) as const,
  )

  // C2.2 payment-method gate input: the Sell surface warns BEFORE push (the
  // pushListing gate is the enforcement; this is the explanation).
  const paymentMethods = await listPaymentMethodRefs(user.id).catch(() => [])

  const linkByChannel = new Map(links.map((l) => [l.channelId, l]))
  return {
    productName: product.name,
    unitCostCents: product.priceCents,
    flavors,
    onDemand: {
      status: enablement?.status ?? 'NONE',
      hasManufacturer: !!manufacturerServiceId,
      partnerNote: enablement?.partnerNote ?? null,
      eligible: eligibility.eligible,
      blockers: eligibility.eligible ? [] : eligibility.reasons.map((r) => ON_DEMAND_INELIGIBLE_COPY[r]),
      paymentMethodOnFile: paymentMethods.length > 0,
    },
    stock: await (async () => {
      const pool = await prisma.inventoryPool.findFirst({
        where: { creatorUserId: user.id, productId, storageLocationKind: 'CREATOR' },
        select: { quantityOnHand: true, quantityReserved: true },
      })
      const onHand = pool?.quantityOnHand ?? 0
      const reserved = pool?.quantityReserved ?? 0
      return { onHand, reserved, available: Math.max(0, onHand - reserved) }
    })(),
    channels: connections.map((conn) => {
      const l = linkByChannel.get(conn.channelId)
      return {
        channelId: conn.channelId,
        code: conn.channel.code,
        displayName: conn.channel.displayName,
        connectionId: conn.id,
        externalAccountId: conn.externalAccountId,
        link: l
          ? {
              id: l.id,
              mode: l.mode ?? 'ON_DEMAND',
              price: l.price != null ? String(l.price) : null,
              publishState: l.publishState ?? (l.externalListingId ? 'PUSHED' : 'DRAFT'),
              externalListingId: l.externalListingId || null,
              externalUrl: l.externalUrl ?? null,
              lastError: l.lastError ?? null,
            }
          : null,
      }
    }),
  }
}

export type SellActionResult = { ok: true } | { ok: false; error: string }

/** Save a channel listing's configuration (mode + price) as DRAFT. */
export async function configureListing(input: {
  productId: string
  channelCode: string
  mode: 'ON_DEMAND' | 'BULK'
  price: string
}): Promise<SellActionResult> {
  const user = await requireUser()
  const price = Number(input.price)
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'Enter a valid price.' }

  const [product, channel] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
      select: { id: true },
    }),
    prisma.channel.findUnique({ where: { code: input.channelCode }, select: { id: true } }),
  ])
  if (!product || !channel) return { ok: false, error: 'Product or channel not found.' }
  const conn = await prisma.channelConnection.findFirst({
    where: { channelId: channel.id, creatorUserId: user.id, status: 'CONNECTED' },
    select: { id: true },
  })
  if (!conn) return { ok: false, error: 'Connect this channel first (Channels page).' }

  const base = {
    channelId: channel.id,
    channelConnectionId: conn.id,
    productId: product.id,
    externalListingId: '', // filled on push
  }
  const extra = { mode: input.mode, price, publishState: 'DRAFT' as const }
  await prisma.channelProductLink.upsert({
    where: { channelId_productId: { channelId: channel.id, productId: product.id } },
    create: { ...base, ...extra },
    update: { ...extra },
  })
  await logAuditAs(user, {
    entityType: 'ChannelProductLink',
    entityId: `${channel.id}:${product.id}`,
    action: 'CHANNEL_LISTING_CONFIGURED',
    payload: { channel: input.channelCode, mode: input.mode, price },
  })
  return { ok: true }
}

/** Record a received bulk delivery into the inventory pool (C2.4 intake).
 *  V1 manual entry; the logistics workstream automates this from delivery
 *  confirmations later. Pure invariants via applyLedgerEntry; audited. */
export async function receiveDelivery(input: { productId: string; quantity: number }): Promise<SellActionResult> {
  const user = await requireUser()
  const qty = Math.floor(Number(input.quantity))
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Enter a positive quantity.' }
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true },
  })
  if (!product) return { ok: false, error: 'Product not found.' }

  try {
    let pool = await prisma.inventoryPool.findFirst({
      where: { creatorUserId: user.id, productId: product.id, storageLocationKind: 'CREATOR' },
      select: { id: true, quantityOnHand: true, quantityReserved: true },
    })
    if (!pool) {
      const created = await prisma.inventoryPool.create({
        data: { creatorUserId: user.id, productId: product.id, storageLocationKind: 'CREATOR' },
      })
      pool = { id: created.id, quantityOnHand: 0, quantityReserved: 0 }
    }
    const applied = applyLedgerEntry(
      { onHand: pool.quantityOnHand, reserved: pool.quantityReserved },
      'DELIVERY_RECEIVED',
      qty,
    )
    if (!applied.ok) return { ok: false, error: applied.reason }
    await prisma.inventoryPool.update({ where: { id: pool.id }, data: { quantityOnHand: applied.next.onHand } })
    await prisma.inventoryLedger.create({
      data: { poolId: pool.id, kind: 'DELIVERY_RECEIVED', delta: qty, actorUserId: user.id, note: 'manual intake (Sell surface)' },
    })
    await logAuditAs(user, {
      entityType: 'InventoryPool',
      entityId: pool.id,
      action: 'INVENTORY_DELIVERY_RECEIVED',
      payload: { productId: product.id, quantity: qty },
    })
    // Stock arrived → recompute the alert; this is the RECOVERY path that sends
    // the one "back to healthy" notification (C6.3, shouldNotify).
    await recomputeStockAlert(user.id, product.id)
    return { ok: true }
  } catch (err) {
    console.error('[channels] receiveDelivery failed:', err)
    return { ok: false, error: 'Could not record the delivery.' }
  }
}

/** Ask the pinned manufacturer to enable on-demand for this product (LOCKED
 *  gate #1). Freezes a light branding snapshot; the partner reviews in their
 *  On-demand queue. Re-requesting after DECLINED/SUSPENDED resets to REQUESTED. */
export async function requestOnDemandEnablement(productId: string): Promise<SellActionResult> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, name: true, productTemplate: { select: { manufacturerServiceId: true } } },
  })
  if (!product) return { ok: false, error: 'Product not found.' }
  const manufacturerServiceId = product.productTemplate?.manufacturerServiceId
  if (!manufacturerServiceId) return { ok: false, error: 'This product has no pinned manufacturer yet.' }

  // Full-service gate #1 (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md):
  // pre-flight BEFORE the manufacturer ever sees a request. On-demand is
  // manufacturer-only, single-dispatch; the creator fixes the product first
  // (unpin an outside printer, etc.), so the queue only carries decidable asks.
  const eligibility = await loadOnDemandEligibility(product.id, user.id)
  if (!eligibility.eligible) {
    return { ok: false, error: `Not eligible for on-demand yet: ${describeOnDemandIneligibility(eligibility.reasons)}` }
  }

  // Branding snapshot (spec §3.2: "snapshot of approved branding"). Freeze the
  // ACTIVE design's latest version so the manufacturer reviews the actual label
  // (Pavel 2026-07-22: the queue card showed no design at all). Null design =
  // the creator hasn't designed yet; the queue says so instead of hiding it.
  const lockedDesign = await prisma.design
    .findFirst({
      where: { productId: product.id, isActiveAlternate: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, exportedPdfAssetId: true } },
      },
    })
    .catch(() => null)
  const lockedVersion = lockedDesign?.versions[0] ?? null

  try {
    const brandingSnapshotJson = {
      note: product.name,
      designId: lockedDesign?.id ?? null,
      designVersionId: lockedVersion?.id ?? null,
      designVersion: lockedVersion?.version ?? null,
      exportedPdfAssetId: lockedVersion?.exportedPdfAssetId ?? null,
      requestedAt: new Date().toISOString(),
    }
    const row = await prisma.onDemandEnablement.upsert({
      where: {
        creatorUserId_productId_manufacturerServiceId: {
          creatorUserId: user.id,
          productId: product.id,
          manufacturerServiceId,
        },
      },
      create: {
        creatorUserId: user.id,
        productId: product.id,
        manufacturerServiceId,
        status: 'REQUESTED',
        brandingSnapshotJson,
      },
      // Re-request refreshes the snapshot: the partner reviews CURRENT branding.
      update: { status: 'REQUESTED', decidedAt: null, brandingSnapshotJson },
    })
    await logAuditAs(user, {
      entityType: 'OnDemandEnablement',
      entityId: row.id,
      action: 'ON_DEMAND_REQUESTED',
      payload: { productId: product.id, manufacturerServiceId },
    })
    return { ok: true }
  } catch (err) {
    console.error('[channels] on-demand request failed:', err)
    return { ok: false, error: 'Could not send the request. Try again.' }
  }
}

/** Push the configured listing to the channel via the adapter seam; write the
 *  variant links (mapping atoms) from the returned external ids. */
export async function pushListing(input: { productId: string; channelCode: string }): Promise<SellActionResult> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    // productTemplate.manufacturerServiceId (2026-07-16): the on-demand enablement
    // gate below is per (creator, product, MANUFACTURER), so the pinned manufacturer
    // has to be loaded to resolve it correctly.
    select: {
      id: true,
      name: true,
      priceCents: true,
      productTemplateId: true,
      productTemplate: { select: { manufacturerServiceId: true } },
    },
  })
  const channel = await prisma.channel.findUnique({ where: { code: input.channelCode }, select: { id: true, code: true } })
  if (!product || !channel) return { ok: false, error: 'Product or channel not found.' }
  const conn = await prisma.channelConnection.findFirst({
    where: { channelId: channel.id, creatorUserId: user.id, status: 'CONNECTED' },
    select: { id: true, externalAccountId: true },
  })
  if (!conn) return { ok: false, error: 'Connect this channel first.' }
  const link = await prisma.channelProductLink.findUnique({
    where: { channelId_productId: { channelId: channel.id, productId: product.id } },
  })
  if (!link) return { ok: false, error: 'Configure the listing (mode + price) first.' }

  const adapter = resolveChannelAdapter(channel.code as ChannelCode)
  if (!adapter) return { ok: false, error: 'This channel’s integration is not configured yet.' }

  // Admin kill switch (spec §3.4a): platform-wide push pause.
  const chOps = await prisma.channel.findFirst({
    where: { id: channel.id },
    select: { pushPaused: true, maintenanceNote: true },
  })
  if (chOps?.pushPaused) {
    const note = chOps.maintenanceNote ? `: ${chOps.maintenanceNote}` : ''
    return { ok: false, error: `Listing pushes for this channel are paused by iLaunchify${note}` }
  }

  const priceStr = link.price != null ? String(link.price) : (product.priceCents / 100).toFixed(2)

  // Channel variants, in preference order (docs/CREATOR_PRODUCT_CONFIGURATION.md §4):
  //   1. the creator's ORDER-TIME configuration snapshot: ONLY the selected flavors,
  //      each with its per-flavor price (a 2-of-6 pick lists 2 variants, not 6);
  //   2. else the Product.selectedFlavorPresetIds subset (published but never ordered);
  //   3. else the full active flavor pool (legacy).
  const latestItem = await prisma.orderItem
    .findFirst({
      where: { productId: product.id, order: { creatorUserId: user.id } },
      orderBy: { order: { createdAt: 'desc' } },
      select: { configurationSnapshot: true },
    })
    .catch(() => null)
  const snapshot = (latestItem?.configurationSnapshot ?? null) as { version?: unknown } | null
  const cfgVariants = isCurrentConfiguration(snapshot) ? configurationChannelVariants(snapshot) : null

  let variants: ListingVariantInput[]
  if (cfgVariants && cfgVariants.length > 0) {
    variants = cfgVariants.map((v) => ({
      variantKey: variantKey(product.id, v.flavorPresetId),
      title: v.name,
      price: v.unitPriceCents != null ? (v.unitPriceCents / 100).toFixed(2) : priceStr,
    }))
  } else {
    // Tier 2: scope to the creator's selected flavors when set.
    const selRow = await prisma.product
      .findUnique({ where: { id: product.id }, select: { selectedFlavorPresetIds: true } })
      .catch(() => null)
    const selectedIds = selRow?.selectedFlavorPresetIds ?? []
    const flavors = product.productTemplateId
      ? await prisma.flavorPreset.findMany({
          where: {
            productTemplateId: product.productTemplateId,
            status: 'ACTIVE',
            ...(selectedIds.length ? { id: { in: selectedIds } } : {}),
          },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        })
      : []
    variants =
      flavors.length > 0
        ? flavors.map((f) => ({ variantKey: variantKey(product.id, f.id), title: f.name, price: priceStr }))
        : [{ variantKey: variantKey(product.id), title: product.name, price: priceStr }]
  }

  try {
    const external = await adapter.pushListing(
      { connectionId: conn.id, externalAccountId: conn.externalAccountId, tokens: { accessToken: 'stub' } },
      {
        title: product.name,
        imageUrls: [],
        variants,
        mode: (link.mode as 'ON_DEMAND' | 'BULK') ?? 'ON_DEMAND',
        currency: 'USD',
      },
    )

    // Go-live gates (spec §3.3): ON_DEMAND needs the manufacturer's enablement;
    // BULK needs received stock (available = onHand minus reserved). Failing a gate
    // isn't an error: the listing sits at PUSHED with the reason recorded.
    const mode = (link.mode as 'ON_DEMAND' | 'BULK') ?? 'ON_DEMAND'
    let live = false
    let gateNote: string | null = null
    if (mode === 'ON_DEMAND') {
      // Scoped to the PINNED manufacturer (2026-07-16). This decides whether the
      // listing goes LIVE, so an unscoped read meant a re-pin could publish on the
      // PREVIOUS manufacturer's consent, for branding the new one never approved.
      // No pinned manufacturer => no valid enablement => not live: fail-closed.
      const pinnedMfr = product.productTemplate?.manufacturerServiceId ?? null
      const en = pinnedMfr
        ? await prisma.onDemandEnablement.findFirst({
            where: { creatorUserId: user.id, productId: product.id, manufacturerServiceId: pinnedMfr },
            select: { status: true },
          })
        : null
      live = en?.status === 'ENABLED'
      if (!live) gateNote = pinnedMfr ? 'Awaiting manufacturer on-demand enablement.' : 'This product has no pinned manufacturer yet.'

      // Full-service gate #3 (docs/ON_DEMAND_FULL_SERVICE_GATE_2026-07-20.md):
      // enablement alone is not enough. The product may have changed since
      // approval (an outside printer pinned, a co-packer added), and going LIVE
      // is what arms per-order production, so re-verify at the door. Fail-closed:
      // ineligible => PUSHED with the reason, never LIVE.
      if (live) {
        const eligibility = await loadOnDemandEligibility(product.id, user.id).catch(
          () => ({ eligible: false, reasons: ['NO_PINNED_MANUFACTURER'] }) as const,
        )
        if (!eligibility.eligible) {
          live = false
          gateNote = `On-demand needs the manufacturer to run the whole order in-house. ${describeOnDemandIneligibility(eligibility.reasons)}`
        }
      }

      // PAYMENT_METHOD_MISSING (C2.2 go-live gate, gate doc §4): each consumer
      // order auto-bills the creator's SAVED method, so going LIVE without one
      // guarantees the first order parks ON_HOLD: a support ticket, not a flow.
      // Same PUSHED-with-reason pattern as the gates above; fail-closed on a
      // read error (a listing must not go live on an unverifiable method).
      if (live) {
        const methods = await listPaymentMethodRefs(user.id).catch(() => [])
        if (methods.length === 0) {
          live = false
          gateNote =
            'PAYMENT_METHOD_MISSING: add a payment method under Settings > Billing so consumer orders can auto-bill production, then push again.'
        }
      }
    } else {
      const pool = await prisma.inventoryPool.findFirst({
        where: { creatorUserId: user.id, productId: product.id },
        select: { quantityOnHand: true, quantityReserved: true },
      })
      const available = pool ? Math.max(0, pool.quantityOnHand - pool.quantityReserved) : 0
      live = available > 0
      if (live) {
        // Push the derived available-to-sell to the channel (never hand-set).
        for (const extId of Object.values(external.variantIds)) {
          await adapter
            .setInventory({ connectionId: conn.id, externalAccountId: conn.externalAccountId, tokens: { accessToken: 'stub' } }, extId, available)
            .catch(() => {})
        }
      } else gateNote = 'Goes live once delivered stock is received.'
    }
    if (live && mode === 'ON_DEMAND') {
      for (const extId of Object.values(external.variantIds)) {
        await adapter
          .setInventory({ connectionId: conn.id, externalAccountId: conn.externalAccountId, tokens: { accessToken: 'stub' } }, extId, 'MADE_TO_ORDER')
          .catch(() => {})
      }
    }

    await prisma.channelProductLink.update({
      where: { id: link.id },
      data: {
        externalListingId: external.externalListingId,
        externalUrl: external.externalUrl ?? null,
        publishState: live ? 'LIVE' : 'PUSHED',
        lastError: gateNote,
        lastPushedAt: new Date(),
      },
    })

    // Variant links: replace-all per push (idempotent).
    await prisma.channelVariantLink.deleteMany({ where: { channelProductLinkId: link.id } })
    await prisma.channelVariantLink.createMany({
      data: variants.map((v) => {
        const parts = v.variantKey.split(':')
        return {
          channelProductLinkId: link.id,
          externalVariantId: external.variantIds[v.variantKey] ?? '',
          productId: product.id,
          flavorPresetId: parts[1] ?? 'base',
          packKey: parts[2] ?? 'unit',
          variantKey: v.variantKey,
          price: Number(v.price),
        }
      }),
    })

    await logSync(conn.id, 'listing.push', 'OK', `listing ${external.externalListingId} · ${variants.length} variant(s)`)
    await logAuditAs(user, {
      entityType: 'ChannelProductLink',
      entityId: link.id,
      action: 'CHANNEL_LISTING_PUSHED',
      payload: { channel: channel.code, externalListingId: external.externalListingId, variants: variants.length, adapter: adapter.code },
    })
    revalidatePath(`/products/${product.id}/publish`)
    return { ok: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'push failed'
    console.error('[channels] listing push failed:', err)
    await logSync(conn.id, 'listing.push', 'ERROR', detail)
    await prisma.channelProductLink
      .update({ where: { id: link.id }, data: { publishState: 'ERROR', lastError: detail } })
      .catch(() => {})
    return { ok: false, error: `Push failed: ${detail}` }
  }
}
