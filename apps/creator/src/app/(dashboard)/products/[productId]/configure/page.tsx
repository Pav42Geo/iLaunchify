// =============================================================================
// Creator-facing configurator — the marketplace "configurator payoff".
// Pick flavor + options → live §9 quote + recomputed FDA Facts label → issue a
// versioned Product Spec Sheet. docs/PRODUCT_CONFIGURATOR_CONSTRAINTS.md §9/§12b/#6.
// =============================================================================

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { loadConfiguratorData } from './configure-data'
import { ConfiguratorClient } from './ConfiguratorClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configure product' }

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function ConfigureProductPage({ params }: PageProps) {
  const { productId } = await params
  const user = await requireUser()

  const data = await loadConfiguratorData(productId, user.id)
  if (!data) notFound()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href={`/products/${productId}`}
        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to product
      </Link>
      <h1 className="mt-3 font-display text-[26px] font-bold tracking-[-0.02em] text-ink-900">
        Configure {data.product.name}
      </h1>
      <p className="mt-1 text-[13px] text-ink-600">
        Pick your flavor and options. The quote and Nutrition Facts update live, then issue a
        spec sheet to lock the configuration.
      </p>

      <div className="mt-6">
        <ConfiguratorClient data={data} />
      </div>
    </div>
  )
}
