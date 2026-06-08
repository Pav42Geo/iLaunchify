// Admin download of a dispatch's production manifest JSON. Admin-scoped (can
// read any dispatch). Returns the stored finishManifestJson as an attachment.

import { NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dispatchId: string }> },
) {
  const { dispatchId } = await params
  const user = await requireUser()
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dispatch = await prisma.orderDispatch.findUnique({
    where: { id: dispatchId },
    select: { id: true, finishManifestJson: true },
  })
  if (!dispatch || !dispatch.finishManifestJson) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(JSON.stringify(dispatch.finishManifestJson, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="manifest-${dispatch.id.slice(-8)}.json"`,
    },
  })
}
