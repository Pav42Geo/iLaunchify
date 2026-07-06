// GET /api/notifications/stream — SSE for the NotificationBell (in-app P2,
// docs/IN_APP_NOTIFICATIONS_AUDIT.md §5 item 9).
//
// Server-side check loop (10s) pushes an event whenever the user's unread
// signature changes — clients get near-realtime updates over ONE connection
// instead of each polling the feed endpoint. Streams rotate at ~55s to stay
// inside serverless limits; EventSource reconnects transparently. The bell
// falls back to jittered polling if this endpoint is unreachable.

import { auth } from '@ilaunchify/auth'
import { countUnread, listNotifications } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CHECK_MS = 10_000
const MAX_LIFETIME_MS = 55_000

export async function GET() {
  const session = await auth()
  if (!session?.user) return new Response('unauthorized', { status: 401 })
  const userId = session.user.id

  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now()
      let lastSig = ''

      async function tick(): Promise<void> {
        try {
          const [unread, latest] = await Promise.all([
            countUnread(userId),
            listNotifications(userId, { limit: 1 }),
          ])
          const sig = `${unread}:${latest[0]?.id ?? ''}`
          if (sig !== lastSig) {
            lastSig = sig
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ unread })}\n\n`))
          } else {
            controller.enqueue(encoder.encode(': hb\n\n')) // comment heartbeat
          }
        } catch {
          // DB hiccup — keep the stream alive; next tick retries.
        }
      }

      await tick()
      interval = setInterval(async () => {
        if (Date.now() - started > MAX_LIFETIME_MS) {
          if (interval) clearInterval(interval)
          try {
            controller.close()
          } catch {
            /* already closed */
          }
          return
        }
        await tick()
      }, CHECK_MS)
    },
    cancel() {
      if (interval) clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
