// Download the production manifest JSON for one dispatch. Ownership-checked:
// the dispatch must belong to the requesting partner. Returns the stored
// finishManifestJson as a downloadable attachment (the real print-ready PDF +
// die-line bundle is the V1.5 render worker's job).

import { NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { serviceOwnedBy } from '@/lib/partner-context'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dispatchId: string }> },
) {
  const { dispatchId } = await params
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dispatch = await prisma.orderDispatch.findFirst({
    where: { id: dispatchId, partnerService: serviceOwnedBy(user.id) },
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
