import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { prisma, isLogisticsEnabled } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { CarrierSettingsClient, type CarrierAccountView } from './CarrierSettingsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Carrier & shipping — iLaunchify Partners' }

// Phase L2a — partner carrier setup (docs/LOGISTICS_AND_FULFILLMENT.md §6.1).
// Two modes: "iLaunchify shipping" (platform EasyPost account, one Forge child
// user per partner — the default) vs BYO (partner-negotiated carrier account).
// The whole surface sits behind the admin 'carrier:easypost' logistics gate;
// the server actions re-check it (this page's gating is UX only).

export default async function ShippingSettingsPage() {
  const user = await requireUser()
  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!partner) return null

  const enabled = await isLogisticsEnabled('carrier:easypost')

  const accounts = enabled
    ? await prisma.carrierAccount.findMany({
        where: { partnerId: partner.id, provider: 'easypost', active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true, externalRef: true, createdAt: true },
      })
    : []

  const toView = (a: (typeof accounts)[number]): CarrierAccountView => ({
    id: a.id,
    type: a.type,
    externalRef: a.externalRef,
    createdAt: a.createdAt.toISOString(),
  })
  const platformAccount = accounts.find((a) => a.type === 'PLATFORM_CHILD') ?? null
  const byoAccounts = accounts.filter((a) => a.type === 'BYO_PARCEL').map(toView)

  return (
    // Prototype panel styling — no page hero (Pavel 2026-07-13); a slim
    // breadcrumb + panel header carries the intro instead.
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="mt-1.5 font-display text-[19px] font-bold leading-tight text-ink-900">
          Carrier &amp; shipping
        </h1>
        <p className="mt-0.5 max-w-2xl text-[13px] text-ink-600">
          How your dispatches get parcel labels. Use iLaunchify shipping (our platform carrier
          account — the default, zero setup) or connect your own negotiated carrier rates.
        </p>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center">
          <Truck className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
          <h2 className="mt-3 font-display text-[15px] font-semibold text-ink-900">
            Carrier services aren&rsquo;t enabled yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-500">
            Platform label purchasing is rolling out gradually. Until it reaches your account,
            keep shipping with your own carrier and enter tracking on each dispatch as today —
            nothing changes for you.
          </p>
        </div>
      ) : (
        <CarrierSettingsClient
          platformAccount={platformAccount ? toView(platformAccount) : null}
          byoAccounts={byoAccounts}
          envConfigured={Boolean(process.env.EASYPOST_API_KEY)}
        />
      )}
    </div>
  )
}
