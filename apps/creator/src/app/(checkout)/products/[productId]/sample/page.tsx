// Sample mini-checkout (Pavel 2026-06-10) — mirrors the production checkout's
// two-column layout (form left, sticky order-summary right). Attachment model
// LOCKED: the creator orders a sample of a product they already own, so this
// loads the owned Product + its enabled ProductSampleOptions + flavor pool, then
// hands off to the SampleCheckout client which calls createSampleOrder.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma, getSampleSettings } from '@ilaunchify/db'
import { requireUser, getCreatorTier } from '@ilaunchify/auth'
// PP-0d: resolve the creator's tier rate server-side and hand the client the bps
// + bounds, so the display cannot compute a different fee than the charge.
import { resolveCreatorFeeBps, resolveCreatorFeeBounds } from '@ilaunchify/plans'
import { SampleCheckout } from './SampleCheckout'
import type { SampleOption } from '@/lib/sample-quote'

export const dynamic = 'force-dynamic'

export default async function SampleCheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const user = await requireUser()
  const settings = await getSampleSettings()

  // PP-0d (Pavel 2026-07-16): a sample carries the creator's SUBSCRIPTION-TIER
  // rate, same as any other order. Resolved here, server-side, through the ONE
  // fee SSOT, and handed down as bps + bounds so SampleCheckout renders exactly
  // what createSampleOrder will charge. settings.samplePlatformFeeBps is
  // DEPRECATED as the fee source (it was a third fee table, defaulted to 0, and
  // ignored the creator's tier).
  const creatorTier = await getCreatorTier(user.id)
  const { feeBps: platformFeeBps } = await resolveCreatorFeeBps(creatorTier)
  const platformFeeBounds = await resolveCreatorFeeBounds(creatorTier)

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    select: { id: true, name: true, productTemplateId: true, brand: { select: { name: true } } },
  })
  if (!product) notFound()

  // Enabled sample options + flavor pool for the product's catalog template.
  const tpl = product.productTemplateId
    ? await (prisma as unknown as {
        productTemplate: {
          findUnique: (a: unknown) => Promise<{
            sampleOptions: Array<SampleOption>
            flavorPresets: Array<{ name: string }>
          } | null>
        }
      }).productTemplate
        .findUnique({
          where: { id: product.productTemplateId },
          select: {
            sampleOptions: {
              where: { enabled: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                kind: true, perFlavorCents: true, samplerSetCents: true, sampleMoq: true,
                maxUnitsPerFlavor: true, leadTimeDays: true, creditTowardFirstOrder: true, creditCapCents: true,
              },
            },
            flavorPresets: { orderBy: { sortOrder: 'asc' }, select: { name: true } },
          },
        })
        .catch(() => null)
    : null

  const options = tpl?.sampleOptions ?? []
  const flavorNames = (tpl?.flavorPresets ?? []).map((f) => f.name).filter((n): n is string => !!n && n.trim().length > 0)

  // Prefill ship-to from the creator's most recent order.
  const last = await prisma.order
    .findFirst({
      where: { creatorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        shipToContactName: true, shipToContactPhone: true, shipToAddressLine1: true, shipToAddressLine2: true,
        shipToCity: true, shipToState: true, shipToPostalCode: true, shipToCountry: true,
      },
    })
    .catch(() => null)

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.06em] text-ink-700">Order a sample</div>
            <div className="truncate text-[15px] font-semibold text-ink-900">{product.name}</div>
          </div>
          <Link href={`/products/${product.id}`} className="text-[12.5px] font-medium text-ink-500 hover:text-pink-600">
            ← Back to product
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {options.length === 0 ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
            <p className="text-[14px] text-ink-700">Samples aren&rsquo;t available for this product yet.</p>
            <Link href={`/products/${product.id}`} className="mt-3 inline-block text-[13px] font-semibold text-pink-700 hover:underline">
              Back to product
            </Link>
          </div>
        ) : (
          <SampleCheckout
            productId={product.id}
            productName={product.name}
            options={options}
            flavorNames={flavorNames}
            isMultiFlavor={flavorNames.length > 1}
            defaultShipTo={last ?? null}
            sampleShippingCents={settings.sampleFlatShippingCents}
            platformFeeBps={platformFeeBps}
            platformFeeBounds={platformFeeBounds}
            brandedRequiresDieline={settings.brandedRequiresDieline}
          />
        )}
      </main>
    </div>
  )
}
