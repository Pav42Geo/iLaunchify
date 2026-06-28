import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ProductDefaultsForm } from './ProductDefaultsForm'
import { getPartnerProductDefaults } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Product defaults — iLaunchify Partners' }

export default async function ProductDefaultsPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, facilities: { select: { id: true, name: true }, orderBy: { isDefault: 'desc' } } },
  })
  if (!partner) return null

  const row = await getPartnerProductDefaults(partner.id)

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-ink-200 bg-[var(--bg-hero)] px-6 py-6">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">
          Product defaults
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-600">
          Set your facility, lead times, MOQ, fulfillment and storage once. Every new product starts pre-filled with
          these — so you only fill what changes per product.
        </p>
      </div>

      <ProductDefaultsForm
        facilities={partner.facilities}
        initial={row ? row : null}
      />
    </div>
  )
}
