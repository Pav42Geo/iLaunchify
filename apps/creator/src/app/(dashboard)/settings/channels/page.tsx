// Phase L3a — /settings/channels: channel connections + Manual setup (V1) +
// per-product FNSKU capture (docs/LOGISTICS_AND_FULFILLMENT.md §7.2/§9).
//
// Amazon SP-API developer credentials are NOT available yet, so the Connect
// button is gated on BOTH Channel.oauthConfigured (admin flag) and the
// AMZ_SPAPI_CLIENT_ID env presence — checked HERE, server-side; the client
// only ever receives a boolean + copy. Manual setup (paste your seller id)
// creates a CONNECTED ChannelConnection today so the CHANNEL_INBOUND checkout
// destination can light up before OAuth exists.
//
// The pre-L3 onboarding intent form (Launch Checklist step 3) stays at the
// bottom — it records which channel the creator PLANS to sell on, which is a
// different fact from a linked seller account.

import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import {
  ChannelConnections,
  type ChannelCardData,
  type FnskuProductRow,
  type ProductLinkData,
} from './ChannelConnections'
import { ChannelForm } from './ChannelForm'
import type { ChannelChoice } from '../../_actions/checklist-actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sales channels — iLaunchify' }

/** Channels with a factory→FC inbound program (FBA / WFS / FBT). */
const INBOUND_CODES = ['amazon', 'walmart', 'tiktok']

export default async function ChannelsSettingsPage() {
  const user = await requireUser()
  const [profile, channels, connections, products] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, onboardingProgress: true },
    }),
    prisma.channel.findMany({
      where: { enabled: true },
      orderBy: { displayName: 'asc' },
      select: { id: true, code: true, displayName: true, oauthConfigured: true },
    }),
    prisma.channelConnection.findMany({
      where: { creatorUserId: user.id },
      select: {
        id: true,
        channelId: true,
        status: true,
        externalAccountId: true,
        productLinks: {
          select: { channelConnectionId: true, productId: true, fnsku: true, externalListingId: true },
        },
      },
    }),
    // FNSKU mapping needs a retail barcode on our side — only GTIN'd products.
    prisma.product.findMany({
      where: { brand: { creatorProfile: { userId: user.id } }, gtin: { not: null } },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true, gtin: true },
    }),
  ])

  if (!profile) {
    return (
      <div className="rounded-md border border-ink-200 bg-white p-6 text-sm text-ink-600">
        Your creator profile is missing — contact support.
      </div>
    )
  }

  // Env presence checked server-side (integrations-registry rule: presence
  // only, never the value; the client receives booleans + copy).
  const amazonEnvReady = Boolean(process.env.AMZ_SPAPI_CLIENT_ID)

  const connByChannel = new Map(connections.map((c) => [c.channelId, c]))
  const cards: ChannelCardData[] = channels.map((ch) => {
    const conn = connByChannel.get(ch.id) ?? null
    const amazonBlocked = ch.code === 'amazon' && (!ch.oauthConfigured || !amazonEnvReady)
    return {
      id: ch.id,
      code: ch.code,
      displayName: ch.displayName,
      connectEnabled: !amazonBlocked && ch.oauthConfigured,
      connectDisabledCopy: amazonBlocked
        ? 'Amazon connection opens once our Amazon developer application is approved'
        : !ch.oauthConfigured
          ? `One-click ${ch.displayName} connection is coming soon.`
          : null,
      supportsInbound: INBOUND_CODES.includes(ch.code),
      connection: conn
        ? { id: conn.id, status: conn.status, externalAccountId: conn.externalAccountId }
        : null,
    }
  })

  const productRows: FnskuProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    gtin: p.gtin ?? '',
  }))
  const links: ProductLinkData[] = connections.flatMap((c) =>
    c.productLinks.map((l) => ({
      channelConnectionId: l.channelConnectionId,
      productId: l.productId,
      fnsku: l.fnsku,
      asin: l.externalListingId || null,
    })),
  )

  // Legacy onboarding-intent state (Launch Checklist step 3).
  const progress = (profile.onboardingProgress as Record<string, unknown> | null) ?? {}
  const initialChannel = (typeof progress.selectedChannel === 'string'
    ? progress.selectedChannel
    : '') as ChannelChoice | ''
  const initialUrl = typeof progress.channelUrl === 'string' ? progress.channelUrl : ''

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-ui-title">Sales channels</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          iLaunchify is the production layer — your customers check out on your
          own channels. Link your seller accounts here so production runs can
          ship straight into a channel&rsquo;s fulfillment network.
        </p>
      </header>

      <ChannelConnections channels={cards} products={productRows} links={links} />

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-ui-section">Where do you plan to sell?</h2>
          <p className="mt-0.5 text-ui-body text-ink-500">
            Recording your primary channel helps us prepare the right shipping +
            packaging defaults (this is separate from linking an account above).
          </p>
        </div>
        <ChannelForm initialChannel={initialChannel} initialUrl={initialUrl} />
      </section>
    </div>
  )
}
