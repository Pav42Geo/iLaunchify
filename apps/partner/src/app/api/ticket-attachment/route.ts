// GET /api/ticket-attachment?ticketId=…&key=…
//
// Partner-scoped download for a ticket reply attachment. getTicket throws if the
// ticket isn't the partner's, and the key must belong to a reply on that ticket —
// so a crafted key can't pull an arbitrary R2 object. Returns a 302 to a 5-minute
// signed URL.

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@ilaunchify/auth'
import { getTicket, attachmentKeyAllowed, TicketNotFoundError } from '@ilaunchify/support'
import { getSignedReadUrl } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const ticketId = req.nextUrl.searchParams.get('ticketId')
  const key = req.nextUrl.searchParams.get('key')
  if (!ticketId || !key) return NextResponse.json({ error: 'Missing ticketId or key' }, { status: 400 })

  try {
    const ticket = await getTicket(ticketId, { role: 'PARTNER', userId: user.id })
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
