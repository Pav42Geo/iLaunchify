// GET /api/ticket-attachment?ticketId=…&key=…
//
// Access-checked download for a ticket reply attachment. Admins may download any
// attachment, but the key must actually belong to a reply on the named ticket —
// so a crafted key can't pull an arbitrary R2 object. Returns a 302 to a 5-minute
// signed URL.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@ilaunchify/auth'
import { getTicket, attachmentKeyAllowed, TicketNotFoundError } from '@ilaunchify/support'
import { getSignedReadUrl } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ticketId = req.nextUrl.searchParams.get('ticketId')
  const key = req.nextUrl.searchParams.get('key')
  if (!ticketId || !key) return NextResponse.json({ error: 'Missing ticketId or key' }, { status: 400 })

  try {
    const ticket = await getTicket(ticketId, { role: 'ADMIN' })
    if (!('replies' in ticket)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const allowed = attachmentKeyAllowed(key, ticket.replies.map((r) => r.attachments))
    if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const url = await getSignedReadUrl(key)
    return NextResponse.redirect(url)
  } catch (err) {
    if (err instanceof TicketNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
