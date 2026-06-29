// C7.j — new accessory page (server wrapper). Loads the partner's ACTIVE
// packaging systems for the optional "applies to" multi-select, then renders
// the client form.

import Link from 'next/link'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ChevronLeft } from 'lucide-react'
import { AccessoryForm } from './AccessoryForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New accessory — iLaunchify Partners' }

export default async function NewAccessoryPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: {
      packagingSystems: {
        where: { status: 'ACTIVE' },
        select: { id: true, partnerName: true, overrideDisplayName: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!partner) return null

  const packagingSystems = partner.packagingSystems.map((p) => ({
    id: p.id,
    name: p.overrideDisplayName ?? p.partnerName,
  }))

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/accessories"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"
        >
          <ChevronLeft className="h-4 w-4" /> Accessories
        </Link>
        <h1 className="mt-1 text-ui-title">New accessory</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          It enters review before creators can bundle it. Listing it means you fulfill it with the order.
        </p>
      </div>
      <AccessoryForm packagingSystems={packagingSystems} />
    </div>
  )
}
