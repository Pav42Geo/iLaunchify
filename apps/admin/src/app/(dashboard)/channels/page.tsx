// Admin /channels — registry of supported external channels with on/off
// toggles. Real OAuth + push-listing functionality lands in V1.1+.

import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { ChannelToggle } from './ChannelToggle'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Channels — Admin' }

export default async function ChannelsPage() {
  const channels = await prisma.channel.findMany({
    orderBy: { displayName: 'asc' },
    include: { _count: { select: { connections: true, productLinks: true } } },
  })

  const enabledCount = channels.filter((c) => c.enabled).length
  const oauthReadyCount = channels.filter((c) => c.oauthConfigured).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-ui-title">Channels</h1>
        <p className="mt-1 text-sm text-ink-500">
          {channels.length} registered · {enabledCount} enabled · {oauthReadyCount} with OAuth credentials configured
        </p>
      </div>

      <Card className="border-warning-200 bg-warning-50/40">
        <CardHeader>
          <CardTitle className="text-base">V1 shell — real OAuth lands in V1.1</CardTitle>
          <CardDescription className="text-warning-900">
            Enabling a channel here exposes it in the creator UI. Creators can't actually connect
            until each channel's OAuth app credentials are configured in env (Client ID/Secret for
            Shopify, SP-API keys for Amazon, etc.). For V1, channels can be toggled visible/hidden
            for soft-launch testing.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {channels.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{c.displayName}</CardTitle>
                <CardDescription>
                  <span className="font-mono text-xs">{c.code}</span>
                  {' · '}
                  {c._count.connections} connection{c._count.connections === 1 ? '' : 's'}
                  {' · '}
                  {c._count.productLinks} listing{c._count.productLinks === 1 ? '' : 's'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                    c.oauthConfigured
                      ? 'bg-success-50 text-success-700 ring-1 ring-success-200'
                      : 'bg-ink-100 text-ink-600 ring-1 ring-ink-200'
                  }`}
                >
                  {c.oauthConfigured ? 'OAuth ready' : 'OAuth not configured'}
                </span>
                <ChannelToggle channelId={c.id} initialEnabled={c.enabled} />
              </div>
            </CardHeader>
            {c.notes && (
              <CardContent className="text-sm text-ink-600">{c.notes}</CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
