// Creator → Help → New ticket. Loads the active category library + the creator's
// recent orders and products. The form shows a context-aware attachment picker
// (order vs product) based on the selected category.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket — Help' }

// Which optional attachment a category invites. Order/payment categories → an
// order; Design-Studio / product / compliance categories → a product. Others →
// none. Drives the picker shown in the form.
const ATTACH_BY_SLUG: Record<string, 'order' | 'product'> = {
  'order-issue': 'order',
  'payment-payout': 'order',
  'account-billing': 'order',
  'design-studio-bug': 'product',
  'product-approval': 'product',
  'compliance-question': 'product',
}

interface PageProps {
  searchParams: Promise<{ category?: string; orderId?: string; productId?: string }>
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const { category: categoryParam, orderId: orderIdParam, productId: productIdParam } =
    await searchParams

  const [categories, orders, products] = await Promise.all([
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, description: true },
    }),
    prisma.order.findMany({
      where: { creatorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, brand: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { brand: { creatorProfile: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, name: true, brand: { select: { name: true } } },
    }),
  ])

  // Deep-link prefill — only honor params that are real + belong to this creator.
  const initialCategorySlug = categories.some((c) => c.slug === categoryParam)
    ? categoryParam
    : undefined
  let initialEntityType: 'Order' | 'Product' | undefined
  let initialEntityId: string | undefined
  if (orderIdParam && orders.some((o) => o.id === orderIdParam)) {
    initialEntityType = 'Order'
    initialEntityId = orderIdParam
  } else if (productIdParam && products.some((p) => p.id === productIdParam)) {
    initialEntityType = 'Product'
    initialEntityId = productIdParam
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Help
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Open a ticket</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tell us what&apos;s going on. The more detail you give, the faster we can help.
        </p>
      </div>
      <NewTicketForm
        categories={categories}
        attachBySlug={ATTACH_BY_SLUG}
        orders={orders.map((o) => ({
          id: o.id,
          label: `#${o.id.slice(-8)}${o.brand?.name ? ` · ${o.brand.name}` : ''}`,
        }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.name}${p.brand?.name ? ` · ${p.brand.name}` : ''}`,
        }))}
        initialCategorySlug={initialCategorySlug}
        initialEntityType={initialEntityType}
        initialEntityId={initialEntityId}
      />
    </div>
  )
}
