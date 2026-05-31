// Landing page after Stripe Checkout success.
// At this point Stripe has redirected back with a session_id, but our
// payment_intent.succeeded webhook may not have fired yet. We show a friendly
// "we got your order" message and let the user click through to track it.
//
// Phase G9 — moved from /order/success to /checkout/success so the live URL
// matches the wizard route. cart-actions.successUrl points here.
//
// Phase G7 (V1.5-T6 sibling, 2026-05-31) — Accessories + Make Viral teasers
// land here instead of being standalone wizard steps. The collapse from 7 →
// 3 steps in R8.a intentionally cut those modules from the buy flow, but
// surfacing them post-checkout still serves the spirit of #445 (give
// creators visibility into the upcoming product set right when they're
// most receptive — they just shipped a run).

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from '@ilaunchify/ui'
import Link from 'next/link'
import {
  CheckCircle2,
  Package2,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Order placed — iLaunchify' }

export default async function OrderSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>
  searchParams: Promise<{ session_id?: string }>
}) {
  const user = await requireUser()
  const { productId } = await params
  await searchParams // we don't currently use session_id (webhook handles state), but accept it

  const product = await prisma.product.findFirst({
    where: { id: productId, brand: { creatorProfile: { userId: user.id } } },
    include: { brand: true },
  })
  if (!product) notFound()

  // Find the most recent order for this product, this creator (likely the one
  // they just paid for, regardless of webhook timing)
  const latestOrder = await prisma.order.findFirst({
    where: {
      creatorUserId: user.id,
      items: { some: { productId: product.id } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-green-600" />
          <div>
            <CardTitle>Production order placed</CardTitle>
            <CardDescription>
              Stripe has confirmed your payment. We&apos;re routing to your partners now.
              You&apos;ll get an email when each partner accepts.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            <span className="font-medium">{product.name}</span> for {product.brand.name}
            {latestOrder && (
              <>
                {' '}— order <span className="font-mono">#{latestOrder.id.slice(-8)}</span>
              </>
            )}
          </p>
          <p className="text-zinc-500">
            Production typically takes 4–6 weeks. We&apos;ll update you at each milestone. After
            delivery, you can push the finished SKU to your sales channels.
          </p>
          <div className="flex flex-wrap gap-2">
            {latestOrder && (
              <Button asChild>
                <Link href={`/orders/${latestOrder.id}`}>Track this order →</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href={`/products/${product.id}`}>Back to product</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* G7 / V1.5 — Accessories + Make Viral teasers. Render after the
          confirmation card so the moment of "shipped my first run" lands
          before we surface what's coming next. Both cards are display-only;
          notify-me wiring lands when the underlying modules actually ship
          (V1.5+ for Accessories, V2+ for Make Viral). */}
      <WhatsNextCards />
    </div>
  )
}

// =============================================================================
// WhatsNextCards — post-checkout teaser for future modules
// =============================================================================
//
// Two cards side-by-side on >sm, stacked on mobile. Same visual language as
// the rest of the dashboard:
//   - cream header band + zinc-200 border (matches /orders, /products)
//   - neon-green "Coming next" pill (signature accent on dark/teaser surfaces
//     per [[ilaunchify-design-system-v1]])
//   - pink-700 "Notify me when it ships" link CTA (no-op in V1; the link
//     itself communicates intent without committing to a notify queue)
//
// Copy is intentionally short — this isn't a sales page, it's a peripheral
// "by the way" moment for someone who just spent money on the primary flow.

function WhatsNextCards() {
  return (
    <section
      aria-labelledby="whats-next-heading"
      className="space-y-3"
    >
      <header className="flex items-baseline justify-between">
        <h2
          id="whats-next-heading"
          className="font-display text-lg font-semibold tracking-tight text-zinc-900"
        >
          Coming next
        </h2>
        <p className="text-[11.5px] text-zinc-500">
          On the roadmap for the months ahead
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ComingNextCard
          icon={<Package2 className="h-4 w-4" aria-hidden="true" />}
          tag="V1.5"
          title="Accessories"
          body="Add neck-hangers, shrink-wrap, kits, and inserts as line items on your next run. One checkout, one shipment."
        />
        <ComingNextCard
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          tag="V2"
          title="Make Viral"
          body="Auto-generate launch-ready social posts, short-form video cuts, and shelf-mockup graphics from your finished design."
        />
      </div>
    </section>
  )
}

function ComingNextCard({
  icon,
  tag,
  title,
  body,
}: {
  icon: React.ReactNode
  tag: string
  title: string
  body: string
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-[#F3EFE8] px-4 py-2.5 text-[12px] text-zinc-700">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-white">
          {icon}
        </span>
        <span className="font-semibold text-zinc-900">{title}</span>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#B5FF3D] px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wider text-zinc-900"
          aria-label={`Available in ${tag}`}
        >
          {tag} · Coming next
        </span>
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[12.5px] leading-snug text-zinc-700">{body}</p>
        <p className="text-[11.5px] text-zinc-500">
          We&rsquo;ll let you know when it ships.{' '}
          <span className="inline-flex items-center gap-0.5 font-semibold text-pink-700">
            On your account by default
            <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        </p>
      </div>
    </article>
  )
}
