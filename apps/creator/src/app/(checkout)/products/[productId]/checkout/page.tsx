// Phase G1 + REBUILD R12.d — checkout wizard entry point.
//
// Server-side loads:
//   - The product + ownership guard
//   - Any in-progress CheckoutDraft (wizard state hydration)
//   - The latest DesignVersion + checklist snapshot (Review step)
//   - The creator's brands list + active-brand cookie (header brand switch)
//   - Unread notification count (header bell dot)
//
// Then hands all of it to the client CheckoutWizard. Auth: requireUser +
// must own the product through brand → creator.

import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { getCreatorTier, requireUser } from '@ilaunchify/auth'
import { CheckoutWizard } from './CheckoutWizard'
import { loadCheckoutDraft } from './actions'
import { loadReviewSnapshot } from './review-actions'

export const dynamic = 'force-dynamic'

const BRAND_COOKIE = 'active_brand_id'

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function CheckoutPage({ params }: PageProps) {
  const { productId } = await params
  const user = await requireUser()

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      brand: { creatorProfile: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      brand: { select: { id: true, name: true } },
    },
  })
  if (!product) notFound()

  // Header data — mirrors DashboardTopbar so the header right-cluster
  // (Heart / Bell / Brand switcher / Account / Cart) looks identical to
  // the rest of the creator app. Reuses the same active-brand cookie.
  const [
    draftResult,
    reviewSnapshot,
    brandsRows,
    unreadCount,
    cookieStore,
    creatorTier,
  ] = await Promise.all([
    loadCheckoutDraft(productId),
    loadReviewSnapshot(productId),
    user.role === 'CREATOR'
      ? prisma.creatorProfile
          .findUnique({
            where: { userId: user.id },
            select: {
              brands: {
                select: { id: true, name: true, handle: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          })
          .then((p) => p?.brands ?? [])
      : Promise.resolve(
          [] as Array<{ id: string; name: string; handle: string }>,
        ),
    prisma.notification.count({
      where: { userId: user.id, channel: 'IN_APP', readAt: null },
    }),
    cookies(),
    // R14.d — drives the Subscribe & save gate on the right rail.
    getCreatorTier(user.id),
  ])
  if (!draftResult.ok) notFound()

  const activeBrandCookie = cookieStore.get(BRAND_COOKIE)?.value ?? ''
  const activeBrandId =
    brandsRows.find((b) => b.id === activeBrandCookie)?.id ??
    product.brand.id ??
    brandsRows[0]?.id ??
    ''

  // R8.a — clamp draft step/completed values into the new 3-step range.
  const initialStep = clampStep(draftResult.data.currentStep)
  const initialCompletedSteps = Array.from(
    new Set(draftResult.data.completedSteps.map(clampStep)),
  ).sort((a, b) => a - b)

  return (
    <CheckoutWizard
      productId={product.id}
      productName={product.name}
      brandName={product.brand.name}
      initialState={draftResult.data.state}
      initialStep={initialStep}
      initialCompletedSteps={initialCompletedSteps}
      hadExistingDraft={draftResult.data.existed}
      reviewSnapshot={reviewSnapshot}
      headerUser={{
        email: user.email,
        name: user.name ?? null,
      }}
      headerBrands={brandsRows}
      headerActiveBrandId={activeBrandId}
      headerHasUnreadNotifications={unreadCount > 0}
      creatorTier={creatorTier}
    />
  )
}

function clampStep(n: number): 1 | 2 | 3 {
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
}
