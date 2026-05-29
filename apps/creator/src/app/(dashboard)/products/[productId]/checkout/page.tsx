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

  const draftResult = await loadCheckoutDraft(productId)
  if (!draftResult.ok) {
    // The auth + ownership guard inside loadCheckoutDraft mirrors the
    // server-side fetch above, so reaching this branch means something
    // odd happened (e.g. user role changed mid-request). Bail to 404.
    notFound()
  }

  return (
    <CheckoutWizard
      productId={product.id}
      productName={product.name}
      brandName={product.brand.name}
      initialState={draftResult.data.state}
      initialStep={draftResult.data.currentStep}
      initialCompletedSteps={draftResult.data.completedSteps}
      hadExistingDraft={draftResult.data.existed}
    />
  )
}
