import { notFound } from 'next/navigation'
import { getBrandOrNotFound } from '@/lib/brand'
import { Card, CardContent } from '@ilaunchify/ui'

// Policies are platform-generated from brand name + standard boilerplate.
// V1.5+: creator can override sections per-brand.
export const revalidate = 3600   // 1 hour

const POLICIES = {
  privacy: {
    title: 'Privacy Policy',
    body: (brandName: string, contactEmail: string) => `
**Last updated:** ${new Date().toLocaleDateString()}

${brandName} respects your privacy. This policy explains what data we collect when you shop with us
and how we use it.

**Data we collect**

- Order information (your name, shipping address, items purchased)
- Payment information processed through Stripe (we never store your card number)
- Email address for order confirmations and shipping updates

**How we use it**

- To fulfill and ship your orders
- To send transactional emails (confirmation, shipping, delivery)
- To process returns and refunds when requested

**Third parties**

- **Stripe**: payment processing
- **iLaunchify**: platform infrastructure (operates this store on behalf of ${brandName})
- **Shipping carriers**: USPS, UPS, FedEx as needed

**Your rights**

You can request a copy of your data, or request deletion, by emailing ${contactEmail}.

**Cookies**

We use a single session cookie to remember your cart between visits. We don't track you across
other sites.
`,
  },
  terms: {
    title: 'Terms of Service',
    body: (brandName: string) => `
**Last updated:** ${new Date().toLocaleDateString()}

By placing an order on ${brandName}'s storefront, you agree to the following:

**1. Eligibility**

You must be at least 18 years old to purchase. By checking out, you confirm this.

**2. Pricing & availability**

Prices and stock levels are subject to change. We reserve the right to cancel and refund orders if
a product becomes unavailable.

**3. Shipping**

Orders ship within 7-14 business days after compliance and production are complete. See our
[Shipping Policy](/${brandName}/policies/shipping) for details.

**4. Returns**

See our [Return Policy](/${brandName}/policies/returns) for the 30-day return window and process.

**5. Health claims**

${brandName} products are not intended to diagnose, treat, cure, or prevent any disease. Consult
your healthcare provider before starting any new supplement.

**6. Platform terms**

This store is operated on iLaunchify, which processes payments on behalf of ${brandName}. Disputes
about payment processing should be directed through Stripe's standard dispute mechanisms.
`,
  },
  shipping: {
    title: 'Shipping Policy',
    body: (brandName: string) => `
**Last updated:** ${new Date().toLocaleDateString()}

**Timeline**

Most orders ship within 7-14 business days. Each order goes through:

1. Compliance + label generation (1-2 days)
2. Production at our manufacturing partner (varies by product)
3. Label printing in parallel (3-5 days)
4. Quality check + shipment (1-2 days)

**Carriers**

We ship via USPS, UPS, or FedEx within the continental US. International shipping is not currently
available.

**Tracking**

You'll receive a tracking number by email as soon as your order ships.

**Lost packages**

If your package shows delivered but you haven't received it, contact us within 7 days and we'll
work with the carrier and reship at our cost.
`,
  },
  returns: {
    title: 'Return Policy',
    body: (brandName: string) => `
**Last updated:** ${new Date().toLocaleDateString()}

**30-day return window**

We accept returns within 30 days of delivery. To start a return, email the order number and reason.

**Eligibility**

- Unopened, unused items in original packaging
- Items in resellable condition

We can't accept opened consumable products (food, beverage, supplements) due to FDA
regulations, except in the case of defects or damage.

**Refunds**

Once we receive and inspect the return, we'll issue a refund to your original payment method.
Refunds typically appear within 5-10 business days.

**Damage or defects**

If your order arrives damaged or defective, send us a photo within 48 hours and we'll replace it
free of charge.
`,
  },
} as const

type PolicyKey = keyof typeof POLICIES

export async function generateMetadata({
  params,
}: { params: Promise<{ handle: string; policySlug: string }> }) {
  const policy = POLICIES[(await params).policySlug as PolicyKey]
  if (!policy) return {}
  return { title: policy.title }
}

export default async function PolicyPage({
  params,
}: { params: Promise<{ handle: string; policySlug: string }> }) {
  const brand = await getBrandOrNotFound((await params).handle)
  const policy = POLICIES[(await params).policySlug as PolicyKey]
  if (!policy) notFound()

  const contactEmail = brand.creatorProfile.user.email
  const body =
    (await params).policySlug === 'privacy'
      ? policy.body(brand.name, contactEmail)
      : policy.body(brand.name)

  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">{policy.title}</h1>
      <Card>
        <CardContent className="pt-6">
          <div className="prose prose-sm max-w-none whitespace-pre-line text-brand-text">
            {body.trim()}
          </div>
        </CardContent>
      </Card>
    </article>
  )
}
