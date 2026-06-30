// Partner → Help → New ticket. Loads the active category library + the partner's
// recent dispatches. The form shows a context-aware dispatch picker for order /
// dispatch categories.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { prisma } from '@ilaunchify/db'
import { NewTicketForm } from './NewTicketForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New ticket — Help' }

// Order / dispatch categories invite a dispatch attachment; product / approval
// categories invite a product. The picker is still fully browseable regardless.
const ATTACH_BY_SLUG: Record<string, 'dispatch' | 'product'> = {
  'order-issue': 'dispatch',
  'dispatch-deadline': 'dispatch',
  'product-approval': 'product',
  'compliance-question': 'product',
}

interface PageProps {
  searchParams: Promise<{ category?: string; dispatchId?: string; productId?: string }>
}

export default async function NewTicketPage({ searchParams }: PageProps) {
  const user = await requireUser()
  const {
    category: categoryParam,
    dispatchId: dispatchIdParam,
    productId: productIdParam,
  } = await searchParams

  const [categories, dispatches, products] = await Promise.all([
    prisma.ticketCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, description: true },
    }),
    prisma.orderDispatch.findMany({
      where: { partnerService: { partner: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      // orderNumber post-dates the generated client → spread it in loosely so the
      // known keys stay precisely typed; read cast-guarded at the use site.
      select: { id: true, type: true, orderId: true, order: { select: { ...({ orderNumber: true } as object) } } },
    }),
    prisma.productTemplate.findMany({
      where: { manufacturerService: { partner: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, name: true },
    }),
  ])

  const initialCategorySlug = categories.some((c) => c.slug === categoryParam)
    ? categoryParam
    : undefined

  // Deep-link prefill — only honor params that are real + belong to this partner.
  let initialEntityType: 'OrderDispatch' | 'ProductTemplate' | undefined
  let initialEntityId: string | undefined
  if (dispatchIdParam && dispatches.some((d) => d.id === dispatchIdParam)) {
    initialEntityType = 'OrderDispatch'
    initialEntityId = dispatchIdParam
  } else if (productIdParam && products.some((p) => p.id === productIdParam)) {
    initialEntityType = 'ProductTemplate'
    initialEntityId = productIdParam
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/help" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Help
      </Link>
      <div>
        <h1 className="text-ui-title text-ink-900">Open a ticket</h1>
        <p className="mt-1 text-ui-body text-ink-500">
          Tell us what&apos;s going on. The more detail you give, the faster we can help.
        </p>
      </div>
      <NewTicketForm
        categories={categories}
        attachBySlug={ATTACH_BY_SLUG}
        dispatches={dispatches.map((d) => ({
          id: d.id,
          label: `Dispatch #${d.id.slice(-8)} · ${d.type.toLowerCase()} · order ${(d as { order?: { orderNumber?: string | null } }).order?.orderNumber ?? `#${d.orderId.slice(-8)}`}`,
        }))}
        products={products.map((p) => ({ id: p.id, label: p.name }))}
        initialCategorySlug={initialCategorySlug}
        initialEntityType={initialEntityType}
        initialEntityId={initialEntityId}
      />
    </div>
  )
}
