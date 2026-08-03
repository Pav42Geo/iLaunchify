// POST /api/webhooks/channels/[channel] (Track B4,
// docs/SHOP_CONNECT_E2E_2026-07-24.md §5). The channel-agnostic webhook
// DOORBELL: marketplaces ring it when something happened; the actual truth is
// then PULLED through the existing C2.1 ingest engine
// (importOrdersForConnectionAsOwner). We never build order state from webhook
// payloads: pull-on-ring is the Printful pattern, immune to payload-shape
// drift and to missed/duplicate deliveries (ingest is idempotent, and the
// hourly poll cron remains the safety net).
//
// Connection resolution, two ways:
//   1. ?cid=<connectionId>: adapters that register per-connection callback
//      URLs (the OAuth callback registers `.../[channel]?cid=<id>`).
//   2. adapter.identifyWebhook(headers, rawBody) -> externalAccountId for
//      app-level registrations (Shopify's X-Shopify-Shop-Domain style).
//
// Security: the sealed per-connection webhook secret is opened from the vault
// and the ADAPTER verifies the signature over the RAW body (HMAC scheme is
// channel-specific). Bad signature = 401. Unknown connection = 200 with
// nothing done (never confirm/deny existence to an unauthenticated caller).
// Admin kill switch (Channel.ingestPaused) is enforced inside the ingest core.
//
// Manual dev test (stub adapter, after connecting a stub channel):
//   curl -X POST 'localhost:3000/api/webhooks/channels/<code>?cid=<connectionId>' \
//     -H 'x-stub-signature: stub-webhook-secret' -d '{"topic":"order.paid"}'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { resolveChannelAdapter, type ChannelCode } from '@ilaunchify/channels'
import { readChannelSecret } from '@/app/(dashboard)/channels/vault'
import { importOrdersForConnectionAsOwner } from '@/app/(dashboard)/channels/orders/ingest-core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function logSyncEvent(connectionId: string, outcome: 'OK' | 'ERROR', detail: string): Promise<void> {
  await prisma.channelSyncEvent
    .create({ data: { channelConnectionId: connectionId, direction: 'WEBHOOK', topic: 'order.webhook', outcome, detail } })
    .catch(() => {})
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelCode } = await params
  const channel = await prisma.channel.findUnique({
    where: { code: channelCode },
    select: { id: true, code: true, enabled: true },
  })
  if (!channel || !channel.enabled) return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })

  const adapter = resolveChannelAdapter(channel.code as ChannelCode)
  if (!adapter?.verifyWebhook) return NextResponse.json({ error: 'No receiver for this channel' }, { status: 404 })

  // Raw body FIRST: every signature scheme signs the exact bytes.
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  // Resolve the connection: per-connection callback (?cid=) wins; app-level
  // registrations fall back to adapter identity extraction.
  const cid = req.nextUrl.searchParams.get('cid')
  let conn: { id: string; status: string; webhookSecretRef: string | null } | null = null
  if (cid) {
    conn = await prisma.channelConnection.findFirst({
      where: { id: cid, channelId: channel.id },
      select: { id: true, status: true, webhookSecretRef: true },
    })
  } else if (adapter.identifyWebhook) {
    const identity = adapter.identifyWebhook({ headers, rawBody })
    if (identity?.externalAccountId) {
      conn = await prisma.channelConnection.findFirst({
        where: { channelId: channel.id, externalAccountId: identity.externalAccountId },
        select: { id: true, status: true, webhookSecretRef: true },
      })
    }
  }
  // Unknown connection: acknowledge and do nothing (no existence oracle, and a
  // 4xx would put vendor retry queues into a loop for a store we can't serve).
  if (!conn) return NextResponse.json({ ok: true })

  // Signature verification with the sealed per-connection secret.
  if (!conn.webhookSecretRef) {
    await logSyncEvent(conn.id, 'ERROR', 'webhook received but no secret on file')
    return NextResponse.json({ error: 'Unverifiable' }, { status: 401 })
  }
  let secret: string | null = null
  try {
    secret = await readChannelSecret(conn.webhookSecretRef, 'webhook_secret')
  } catch {
    secret = null // tamper/key mismatch reads as unverifiable, never a 500
  }
  if (!secret || !(await adapter.verifyWebhook({ headers, rawBody, secret }))) {
    await logSyncEvent(conn.id, 'ERROR', 'webhook signature rejected')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (conn.status !== 'CONNECTED') {
    // Verified but dormant (TOKEN_EXPIRED / DISCONNECTED): acknowledge so the
    // vendor stops retrying; the poll cron picks history up after reconnect.
    await logSyncEvent(conn.id, 'OK', `verified webhook ignored: connection ${conn.status}`)
    return NextResponse.json({ ok: true, ignored: conn.status })
  }

  // Doorbell: pull the truth through the ingest engine (idempotent; enforces
  // the admin ingest-pause kill switch internally).
  const summary = await importOrdersForConnectionAsOwner(conn.id)
  if (!summary) {
    await logSyncEvent(conn.id, 'ERROR', 'ingest skipped: connection owner missing')
    return NextResponse.json({ ok: true })
  }
  await logSyncEvent(
    conn.id,
    summary.errors.length ? 'ERROR' : 'OK',
    `doorbell ingest: pulled ${summary.pulled} · imported ${summary.imported}${summary.errors.length ? ` · ${summary.errors[0]}` : ''}`,
  )
  return NextResponse.json({ ok: true, pulled: summary.pulled, imported: summary.imported })
}
