'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, variantKey, applyLedgerEntry, type ChannelCode, type ListingVariantInput } from '@ilaunchify/channels'
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
// links (the mapping atom) are written on push. New columns (mode/price/
// publishState + ChannelVariantLink) are cast-guarded so this degrades before
// `pnpm db:push`.
// =============================================================================

type VariantLinkDelegate = {
  deleteMany: (a: unknown) => Promise<unknown>
  createMany: (a: unknown) => Promise<unknown>
}
const variantLinkDelegate = () => (prisma as unknown as { channelVariantLink?: VariantLinkDelegate }).channelVariantLink ?? null
type SyncEventDelegate = { create: (a: unknown) => Promise<unknown> }
const syncEventDelegate = () => (prisma as unknown as { channelSyncEvent?: SyncEventDelegate }).channelSyncEvent ?? null

async function logSync(connectionId: string, topic: string, outcome: 'OK' | 'ERROR', detail?: string) {
  await syncEventDelegate()
    ?.create({ data: { channelConnectionId: connectionId, direction: 'PUSH', topic, outcome, detail: detail ?? null } })
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
  /** Production unit cost in cents (what the creator pays) — margin-hint baseline. */
  unitCostCents: number
  flavors: Array<{ id: string; name: string }>
  channels: SellChannelRow[]
  /** On-demand gate state for THIS product (LOCKED gate #1): the pinned
   *  manufacturer's enablement. 'NONE' = never requested; null manufacturer =
   *  product has no pinned manufacturer yet (can't request). */
  onDemand: { status: string; hasManufacturer: boolean; partnerNote: string | null }
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
  const enablement = await (
    prisma as unknown as {
      onDemandEnablement?: { findFirst: (a: unknown) => Promise<{ status: string; partnerNote: string | null } | null> }
    }
  ).onDemandEnablement
    ?.findFirst({ where: { creatorUserId: user.id, productId }, select: { status: true, partnerNote: true } })
    .catch(() => null)

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

  const linkByChannel = new Map(links.map((l) => [l.channelId, l]))
  return {
    productName: product.name,
    unitCostCents: product.priceCents,
    flavors,
    onDemand: {
      status: enablement?.status ?? 'NONE',
      hasManufacturer: !!manufacturerServiceId,
      partnerNote: enablement?.partnerNote ?? null,
    },
    stock: await (async () => {
      const pool = await (
        prisma as unknown as {
          inventoryPool?: { findFirst: (a: unknown) => Promise<{ quantityOnHand: number; quantityReserved: number } | null> }
        }
      ).inventoryPool
        ?.findFirst({
          where: { creatorUserId: user.id, productId, storageLocationKind: 'CREATOR' },
          select: { quantityOnHand: true, quantityReserved: true },
        })
        .catch(() => null)
      const onHand = Number(pool?.quantityOnHand ?? 0)
      const reserved = Number(pool?.quantityReserved ?? 0)
      return { onHand, reserved, available: Math.max(0, onHand - reserved) }
    })(),
    channels: connections.map((conn) => {
      const l = linkByChannel.get(conn.channelId) as
        | ((typeof links)[number] & { mode?: string; price?: unknown; publishState?: string; lastError?: string | null })
        | undefined
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
  const extra = { mode: input.mode, price, publishState: 'DRAFT' }
  try {
    await prisma.channelProductLink.upsert({
      where: { channelId_productId: { channelId: channel.id, productId: product.id } },
      create: { ...base, ...(extra as object) },
      update: { ...(extra as object) },
    })
  } catch {
    // Pre-db:push degrade: persist the V1 shape only (config re-savable after push).
    await prisma.channelProductLink.upsert({
      where: { channelId_productId: { channelId: channel.id, productId: product.id } },
      create: base,
      update: {},
    })
  }
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

  const poolDelegate = (
    prisma as unknown as {
      inventoryPool?: {
        findFirst: (a: unknown) => Promise<{ id: string; quantityOnHand: number; quantityReserved: number } | null>
        create: (a: unknown) => Promise<{ id: string }>
        update: (a: unknown) => Promise<unknown>
      }
      inventoryLedger?: { create: (a: unknown) => Promise<unknown> }
    }
  )
  if (!poolDelegate.inventoryPool) return { ok: false, error: 'Inventory tables not migrated yet — run db:push.' }

  try {
    let pool = await poolDelegate.inventoryPool.findFirst({
      where: { creatorUserId: user.id, productId: product.id, storageLocationKind: 'CREATOR' },
      select: { id: true, quantityOnHand: true, quantityReserved: true },
    })
    if (!pool) {
      const created = await poolDelegate.inventoryPool.create({
        data: { creatorUserId: user.id, productId: product.id, storageLocationKind: 'CREATOR' },
      })
      pool = { id: created.id, quantityOnHand: 0, quantityReserved: 0 }
    }
    const applied = applyLedgerEntry(
      { onHand: Number(pool.quantityOnHand), reserved: Number(pool.quantityReserved) },
      'DELIVERY_RECEIVED',
      qty,
    )
    if (!applied.ok) return { ok: false, error: applied.reason }
    await poolDelegate.inventoryPool.update({ where: { id: pool.id }, data: { quantityOnHand: applied.next.onHand } })
    await poolDelegate.inventoryLedger?.create({
      data: { poolId: pool.id, kind: 'DELIVERY_RECEIVED', delta: qty, actorUserId: user.id, note: 'manual intake (Sell surface)' },
    })
    await logAuditAs(user, {
      entityType: 'InventoryPool',
      entityId: pool.id,
      action: 'INVENTORY_DELIVERY_RECEIVED',
      payload: { productId: product.id, quantity: qty },
    })
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

  const delegate = (
    prisma as unknown as {
      onDemandEnablement?: { upsert: (a: unknown) => Promise<{ id: string }> }
    }
  ).onDemandEnablement
  if (!delegate) return { ok: false, error: 'On-demand tables not migrated yet — run db:push.' }

  try {
    const row = await delegate.upsert({
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
        brandingSnapshotJson: { note: product.name, requestedAt: new Date().toISOString() },
      },
      update: { status: 'REQUESTED', decidedAt: null },
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
    return { ok: false, error: 'Could not send the request — try again.' }
  }
}

/** Push the configured listing to the channel via the adapter seam; write the
 *  variant links (mapping atoms) from the returned external ids. */
export async function pushListing(input: { productId: string; channelCode: string }): Promise<SellActionResult> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, name: true, priceCents: true, productTemplateId: true },
  })
  const channel = await prisma.channel.findUnique({ where: { code: input.channelCode }, select: { id: true, code: true } })
  if (!product || !channel) return { ok: false, error: 'Product or channel not found.' }
  const conn = await prisma.channelConnection.findFirst({
    where: { channelId: channel.id, creatorUserId: user.id, status: 'CONNECTED' },
    select: { id: true, externalAccountId: true },
  })
  if (!conn) return { ok: false, error: 'Connect this channel first.' }
  const link = (await prisma.channelProductLink.findUnique({
    where: { channelId_productId: { channelId: channel.id, productId: product.id } },
  })) as ({ id: string; externalListingId: string } & { mode?: string; price?: unknown }) | null
  if (!link) return { ok: false, error: 'Configure the listing (mode + price) first.' }

  const adapter = resolveChannelAdapter(channel.code as ChannelCode)
  if (!adapter) return { ok: false, error: 'This channel’s integration is not configured yet.' }

  // Admin kill switch (spec §3.4a): platform-wide push pause. Cast-guarded —
  // pre-db:push the ops columns don't exist and the select throws → not paused.
  const chOps = await (
    prisma as unknown as { channel?: { findFirst?: (a: unknown) => Promise<{ pushPaused?: boolean; maintenanceNote?: string | null } | null> } }
  ).channel
    ?.findFirst?.({ where: { id: channel.id }, select: { pushPaused: true, maintenanceNote: true } })
    .catch(() => null)
  if (chOps?.pushPaused) {
    const note = chOps.maintenanceNote ? ` — ${chOps.maintenanceNote}` : ''
    return { ok: false, error: `Listing pushes for this channel are paused by iLaunchify${note}` }
  }

  const priceStr = link.price != null ? String(link.price) : (product.priceCents / 100).toFixed(2)
  const flavors = product.productTemplateId
    ? await prisma.flavorPreset.findMany({
        where: { productTemplateId: product.productTemplateId, status: 'ACTIVE' },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      })
    : []
  const variants: ListingVariantInput[] =
    flavors.length > 0
      ? flavors.map((f) => ({ variantKey: variantKey(product.id, f.id), title: f.name, price: priceStr }))
      : [{ variantKey: variantKey(product.id), title: product.name, price: priceStr }]

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
    // BULK needs received stock (available = onHand − reserved). Failing a gate
    // isn't an error — the listing sits at PUSHED with the reason recorded.
    const mode = (link.mode as 'ON_DEMAND' | 'BULK') ?? 'ON_DEMAND'
    let live = false
    let gateNote: string | null = null
    if (mode === 'ON_DEMAND') {
      const en = await (
        prisma as unknown as { onDemandEnablement?: { findFirst: (a: unknown) => Promise<{ status: string } | null> } }
      ).onDemandEnablement
        ?.findFirst({ where: { creatorUserId: user.id, productId: product.id }, select: { status: true } })
        .catch(() => null)
      live = en?.status === 'ENABLED'
      if (!live) gateNote = 'Awaiting manufacturer on-demand enablement.'
    } else {
      const pool = await (
        prisma as unknown as {
          inventoryPool?: { findFirst: (a: unknown) => Promise<{ quantityOnHand: number; quantityReserved: number } | null> }
        }
      ).inventoryPool
        ?.findFirst({
          where: { creatorUserId: user.id, productId: product.id },
          select: { quantityOnHand: true, quantityReserved: true },
        })
        .catch(() => null)
      const available = pool ? Math.max(0, Number(pool.quantityOnHand) - Number(pool.quantityReserved)) : 0
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

    try {
      await prisma.channelProductLink.update({
        where: { id: link.id },
        data: {
          externalListingId: external.externalListingId,
          externalUrl: external.externalUrl ?? null,
          publishState: live ? 'LIVE' : 'PUSHED',
          lastError: gateNote,
          lastPushedAt: new Date(),
        } as object,
      })
    } catch {
      await prisma.channelProductLink.update({
        where: { id: link.id },
        data: { externalListingId: external.externalListingId, externalUrl: external.externalUrl ?? null, lastPushedAt: new Date() },
      })
    }

    // Variant links — replace-all per push (idempotent).
    const vld = variantLinkDelegate()
    if (vld) {
      await vld.deleteMany({ where: { channelProductLinkId: link.id } }).catch(() => {})
      await vld
        .createMany({
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
        .catch(() => {})
    }

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
      .update({ where: { id: link.id }, data: { publishState: 'ERROR', lastError: detail } as object })
      .catch(() => {})
    return { ok: false, error: `Push failed: ${detail}` }
  }
}
