// On-demand die-line download. Die-line files are private R2 objects
// (PartnerFile), so we never expose the bucket — we mint a short-lived signed
// read URL and redirect. Ownership-checked: the requesting partner must own
// the file. Runs only on click (not on page render), so a missing R2 config
// in dev fails the click, not the product page.

import { NextResponse } from 'next/server'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { getSignedReadUrl } from '@ilaunchify/storage'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params
  const user = await requireUser()
  if (user.role !== 'PARTNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const file = await prisma.partnerFile.findUnique({
    where: { id: fileId },
    select: { r2Key: true, partnerId: true },
  })
  if (!file || file.partnerId !== partner.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const url = await getSignedReadUrl(file.r2Key, { expiresInSeconds: 300 })
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: 'File storage not available' }, { status: 502 })
  }
}
