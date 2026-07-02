'use server'

// Phase L3a — creator channel-connection management (docs/LOGISTICS_AND_FULFILLMENT.md §7.2).
//
// Amazon SP-API developer credentials are NOT available yet, so there is no
// live OAuth here — this file ships the DATA CAPTURE the CHANNEL_INBOUND
// destination needs so that flipping the `channel_inbound:AMAZON_FBA`
// LogisticsSetting later requires no schema/UI change:
//
//   createManualChannelConnection — "Manual setup (V1)": the creator pastes
//     their seller id (Amazon: Seller Central → Settings → Account Info →
//     Merchant Token) and we upsert a CONNECTED ChannelConnection row. That
//     row is what lights up the "Ship into my sales channel" checkout card.
//   saveChannelProductFnsku — per-product FNSKU (+ optional ASIN) capture on
//     ChannelProductLink. FNSKU is seller-scoped, which is why it lives on the
//     link and not on Product.
//   connectChannelOauth — placeholder: returns a friendly "not yet" error.
//     The real SP-API OAuth flow is a later phase (needs the approved app).
//
// AuditLog entity choice: AUDIT_ENTITY_TYPES (packages/audit — Code's zone,
// not edited here) has no Channel* entry yet. Connections are logged against
// 'User' (they are creator-user-scoped rows) and product links against
// 'Product' (they are product-scoped identifiers) — same precedent as
// StorageAgreement logging against 'Order' in Phase L1b until its own type
// landed. Actions are free-form strings by design (AuditAction is open).

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { logAuditAs } from '@ilaunchify/audit'
import { revalidatePath } from 'next/cache'

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string }

// -----------------------------------------------------------------------------
// FNSKU format heuristic
// -----------------------------------------------------------------------------
//
// Canonical FNSKUs are 10 alphanumeric characters starting "X0" (Amazon-minted)
// or "B0" (brand-registered sellers whose FNSKU collapses to the ASIN). We WARN
// on mismatch but never block: (a) legacy seller accounts carry FNSKUs outside
// this shape, (b) brand-registered sellers may label with the GS1 UPC instead
// (until 2026-03-31), and (c) the value is only used to render/verify labels —
// Amazon itself rejects a truly invalid FNSKU at inbound-plan creation, which
// is the authoritative check. Blocking here would strand valid accounts on a
// heuristic.
const FNSKU_RE = /^(X0|B0)[A-Z0-9]{8}$/

// -----------------------------------------------------------------------------
// Guards
// -----------------------------------------------------------------------------

async function requireCreator() {
  const user = await requireUser()
  if (user.role !== 'CREATOR') return { user: null, error: 'Only creators can manage channel connections.' }
  return { user, error: null as null }
}

// -----------------------------------------------------------------------------
// OAuth connect — placeholder until the SP-API developer application is approved
// -----------------------------------------------------------------------------

export async function connectChannelOauth(channelId: string): Promise<Result> {
  const { user, error } = await requireCreator()
  if (error || !user) return { ok: false, error: error ?? 'Not signed in.' }

  const channel = await prisma.channel.findFirst({
    where: { id: channelId, enabled: true },
    select: { code: true, displayName: true, oauthConfigured: true },
  })
  if (!channel) return { ok: false, error: 'This channel is not available.' }

  // Amazon: gated on BOTH the admin oauthConfigured flag and the env key
  // (integrations-registry pattern — presence only, never the value).
  if (channel.code === 'amazon' && (!channel.oauthConfigured || !process.env.AMZ_SPAPI_CLIENT_ID)) {
    return {
      ok: false,
      error: 'Amazon connection opens once our Amazon developer application is approved.',
    }
  }

  // Friendly not-yet error for every channel — the real OAuth handshake is a
  // later phase. Manual setup (below the button) works today.
  return {
    ok: false,
    error: `One-click ${channel.displayName} connection isn't live yet — use Manual setup below to link your seller account in the meantime.`,
  }
}

// -----------------------------------------------------------------------------
// Manual setup (V1) — paste-the-seller-id connection
// -----------------------------------------------------------------------------

export async function createManualChannelConnection(input: {
  channelId: string
  externalAccountId: string
}): Promise<Result<{ connectionId: string }>> {
  const { user, error } = await requireCreator()
  if (error || !user) return { ok: false, error: error ?? 'Not signed in.' }

  const externalAccountId = input.externalAccountId.trim()
  if (!externalAccountId) {
    return { ok: false, error: 'Paste your seller account id first.' }
  }
  if (externalAccountId.length > 64) {
    return { ok: false, error: 'That looks too long for a seller account id.' }
  }

  const channel = await prisma.channel.findFirst({
    where: { id: input.channelId, enabled: true },
    select: { id: true, code: true, displayName: true },
  })
  if (!channel) return { ok: false, error: 'This channel is not available.' }

  // One connection per (channel, creator) — @@unique on ChannelConnection.
  // Manual rows are CONNECTED immediately: there are no tokens to validate in
  // V1, and CONNECTED is what the CHANNEL_INBOUND destination card keys off.
  const existing = await prisma.channelConnection.findUnique({
    where: { channelId_creatorUserId: { channelId: channel.id, creatorUserId: user.id } },
    select: { id: true, status: true, externalAccountId: true },
  })
  const connection = existing
    ? await prisma.channelConnection.update({
        where: { id: existing.id },
        data: {
          externalAccountId,
          status: 'CONNECTED',
          connectedAt: new Date(),
          disconnectedAt: null,
        },
        select: { id: true },
      })
    : await prisma.channelConnection.create({
        data: {
          channelId: channel.id,
          creatorUserId: user.id,
          externalAccountId,
          status: 'CONNECTED',
          connectedAt: new Date(),
        },
        select: { id: true },
      })

  await logAuditAs(user, {
    entityType: 'User', // ChannelConnection has no audit entity type yet (see header)
    entityId: user.id,
    action: existing ? 'CHANNEL_CONNECTION_UPDATED' : 'CHANNEL_CONNECTION_CONNECTED',
    fromValue: existing ? existing.status : null,
    toValue: 'CONNECTED',
    payload: {
      channelConnectionId: connection.id,
      channelCode: channel.code,
      externalAccountId,
      method: 'MANUAL_V1', // no OAuth — seller id pasted from Seller Central
      surface: 'settings-channels',
    },
  })

  revalidatePath('/settings/channels')
  return { ok: true, data: { connectionId: connection.id } }
}

export async function disconnectChannelConnection(connectionId: string): Promise<Result> {
  const { user, error } = await requireCreator()
  if (error || !user) return { ok: false, error: error ?? 'Not signed in.' }

  // Ownership fence — the connection must belong to THIS creator.
  const connection = await prisma.channelConnection.findFirst({
    where: { id: connectionId, creatorUserId: user.id },
    select: { id: true, status: true, channel: { select: { code: true } } },
  })
  if (!connection) return { ok: false, error: 'Connection not found.' }

  await prisma.channelConnection.update({
    where: { id: connection.id },
    data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
  })

  await logAuditAs(user, {
    entityType: 'User',
    entityId: user.id,
    action: 'CHANNEL_CONNECTION_DISCONNECTED',
    fromValue: connection.status,
    toValue: 'DISCONNECTED',
    payload: {
      channelConnectionId: connection.id,
      channelCode: connection.channel.code,
      surface: 'settings-channels',
    },
  })

  revalidatePath('/settings/channels')
  return { ok: true, data: null }
}

// -----------------------------------------------------------------------------
// Per-product FNSKU (+ optional ASIN) capture
// -----------------------------------------------------------------------------

export async function saveChannelProductFnsku(input: {
  channelConnectionId: string
  productId: string
  fnsku: string
  asin?: string
}): Promise<Result<{ warning: string | null }>> {
  const { user, error } = await requireCreator()
  if (error || !user) return { ok: false, error: error ?? 'Not signed in.' }

  const fnsku = input.fnsku.trim().toUpperCase()
  const asin = input.asin?.trim().toUpperCase() ?? ''
  if (!fnsku) return { ok: false, error: 'Enter the FNSKU first.' }

  // Ownership fences: connection is the creator's own, product hangs off one
  // of the creator's brands (tenant isolation — threat #1; no ad-hoc trust).
  const [connection, product] = await Promise.all([
    prisma.channelConnection.findFirst({
      where: { id: input.channelConnectionId, creatorUserId: user.id },
      select: { id: true, channelId: true, channel: { select: { code: true } } },
    }),
    prisma.product.findFirst({
      where: { id: input.productId, brand: { creatorProfile: { userId: user.id } } },
      select: { id: true, gtin: true },
    }),
  ])
  if (!connection) return { ok: false, error: 'Connection not found.' }
  if (!product) return { ok: false, error: 'Product not found.' }

  // Warn-don't-block format heuristic (see FNSKU_RE comment above).
  const warning = FNSKU_RE.test(fnsku)
    ? null
    : 'That doesn’t match the usual FNSKU shape (10 characters starting X0 or B0). Saved anyway — double-check it against Seller Central before shipping inbound.'

  const link = await prisma.channelProductLink.upsert({
    where: { channelId_productId: { channelId: connection.channelId, productId: product.id } },
    create: {
      channelId: connection.channelId,
      channelConnectionId: connection.id,
      productId: product.id,
      // externalListingId is required (String, not nullable) — the ASIN when the
      // creator has one; empty until the listing exists / is linked (Phase L3b
      // listing sync fills it from SP-API).
      externalListingId: asin,
      fnsku,
    },
    update: {
      channelConnectionId: connection.id,
      fnsku,
      // Only overwrite the listing id when the creator actually typed an ASIN —
      // never blank an id a future listing sync populated.
      ...(asin ? { externalListingId: asin } : {}),
    },
    select: { id: true },
  })

  await logAuditAs(user, {
    entityType: 'Product', // ChannelProductLink has no audit entity type yet (see header)
    entityId: product.id,
    action: 'CHANNEL_PRODUCT_LINK_UPSERT',
    payload: {
      channelProductLinkId: link.id,
      channelConnectionId: connection.id,
      channelCode: connection.channel.code,
      fnsku,
      asin: asin || null,
      gtin: product.gtin,
      formatWarning: warning !== null,
      surface: 'settings-channels',
    },
  })

  revalidatePath('/settings/channels')
  return { ok: true, data: { warning } }
}
