// GET /api/proof-file/[roundId] — creator-scoped proof download (P2 proof
// loop, D3). Ownership walk: round → dispatch → order.creatorUserId must be
// the session user; the file is the round's PartnerFile. 302 to a 5-minute
// signed URL (ticket-attachment pattern — never expose raw bucket URLs).

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { getSignedReadUrl } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const user = await requireUser()
  const { roundId } = await params

  const round = await prisma.proofRound.findFirst({
    where: { id: roundId, orderDispatch: { order: { creatorUserId: user.id } } },
    select: { assetId: true },
  })
  if (!round) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await prisma.partnerFile.findUnique({
    where: { id: round.assetId },
    select: { r2Key: true },
  })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = await getSignedReadUrl(file.r2Key)
  return NextResponse.redirect(url)
}
