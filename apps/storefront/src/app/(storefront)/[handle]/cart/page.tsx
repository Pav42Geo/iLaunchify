import { getBrandOrNotFound } from '@/lib/brand'
import { getCurrentCart, formatCents } from '@/lib/cart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@ilaunchify/ui'
import Link from 'next/link'
import { CartLine } from './CartLine'
import { CheckoutButton } from './CheckoutButton'
import { computeApplicationFee } from '@ilaunchify/payments'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cart' }

export default async function CartPage({ params }: { params: Promise<{ handle: string }> }) {
  const brand = await getBrandOrNotFound((await params).handle)
  const cart = await getCurrentCart(brand.id)

  if (!cart || cart.items.length === 0) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Your cart is empty</CardTitle>
          <CardDescription>Browse {brand.name} to find something you love.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={`/${brand.handle}`}>← Continue shopping</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const subtotalCents = cart.items.reduce(
    (sum, item) => sum + item.priceAtAddCents * item.quantity,
    0,
  )
  const platformFeeCents = computeApplicationFee({
    subtotalCents,
    rateBp: brand.creatorProfile.feeRateOverrideBp ?? undefined,
  })

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Your cart</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,300px]">
        <ul className="space-y-3">
          {cart.items.map((item) => (
            <li key={item.id}>
              <CartLine
                item={{
                  id: item.id,
                  productId: item.productId,
                  productName: item.product.name,
                  productSlug: item.product.slug,
                  unitPriceCents: item.priceAtAddCents,
                  quantity: item.quantity,
                  inventoryAvailable: item.product.inventoryAvailable,
                }}
                brandHandle={brand.handle}
              />
            </li>
          ))}
        </ul>

        <aside className="rounded-brand border border-zinc-200 bg-brand-muted p-4">
          <h2 className="mb-3 font-semibold">Order summary</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatCents(subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-brand-secondary">
              <dt>Shipping</dt>
              <dd>Calculated at checkout</dd>
            </div>
            <div className="flex justify-between text-brand-secondary">
              <dt>Tax</dt>
              <dd>Calculated at checkout</dd>
            </div>
            <div className="my-2 border-t border-zinc-300"></div>
            <div className="flex justify-between font-semibold">
              <dt>Total before tax + shipping</dt>
              <dd>{formatCents(subtotalCents)}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <CheckoutButton brandHandle={brand.handle} />
            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link href={`/${brand.handle}`}>Continue shopping</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-brand-secondary">
            Payment is processed securely on Stripe. We never see your card.
          </p>
        </aside>
      </div>
    </div>
  )
}
