// Phase G1 — checkout wizard entry point.
//
// Server-side loads the product + any in-progress CheckoutDraft and hands
// off to the client CheckoutWizard. Wizard state is autosaved via the
// actions file on every Next/Back.
//
// Auth: requireUser + must own the product through brand → creator.

import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { CheckoutWizard } from './CheckoutWizard'
import { loadCheckoutDraft } from './actions'
import { loadReviewSnapshot } from './review-actions'

export const dynamic = 'force-dynamic'

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
      brand: { select: { name: true } },
    },
  })
  if (!product) notFound()

  const [draftResult, reviewSnapshot] = await Promise.all([
    loadCheckoutDraft(productId),
    loadReviewSnapshot(productId),
  ])
  if (!draftResult.ok) {
    // The auth + ownership guard inside loadCheckoutDraft mirrors the
    // server-side fetch above, so reaching this branch means something
    // odd happened (e.g. user role changed mid-request). Bail to 404.
    notFound()
  }

  // R8.a — clamp draft step/completed values into the new 3-step
  // index range. Older drafts persisted indices up to 7; mapping them
  // forward keeps a returning creator on a valid screen instead of
  // a blank one.
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
    />
  )
}

function clampStep(n: number): 1 | 2 | 3 {
  if (n <= 1) return 1
  if (n === 2) return 2
  return 3
}
