'use server'

import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { logAuditAs } from '@ilaunchify/audit'
import { resolveChannelAdapter, variantKey, type ChannelCode, type ListingVariantInput } from '@ilaunchify/channels'
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
}

/** Everything the Sell section needs: connected channels + per-channel listing state. */
export async function loadSellData(productId: string): Promise<SellData | null> {
  const user = await requireUser()
  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, name: true, priceCents: true, productTemplateId: true },
  })
  if (!product) return null

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

    try {
      await prisma.channelProductLink.update({
        where: { id: link.id },
        data: {
          externalListingId: external.externalListingId,
          externalUrl: external.externalUrl ?? null,
          publishState: 'PUSHED',
          lastError: null,
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
