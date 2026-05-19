import Link from 'next/link'
import { Button } from '@ilaunchify/ui'

export const metadata = { title: 'Become a Manufacturing Partner — iLaunchify' }

export default function ManufacturersLanding() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Manufacturing Partners</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Fill your production capacity with recurring, pre-qualified orders from creator brands.
      </p>

      <section className="mt-10 space-y-6">
        <Block
          title="Who we work with"
          body="US-based contract manufacturers with FDA registration + cGMP certification, focused on supplements, functional food, and functional beverage. Typical run sizes 500–5,000 units."
        />
        <Block
          title="What you get"
          body="Pre-qualified orders routed automatically to your facility. Compliance handled at the label layer so you don't have to. Stripe-managed payouts on shipment confirmation."
        />
        <Block
          title="What we ask"
          body="Disclosure preference (anonymous, city + state, or full name). MOQ range, lead times, container formats, certifications. We verify before activating."
        />
      </section>

      <div className="mt-12 flex justify-center">
        <Button asChild size="lg">
          <Link href="/partners/apply?type=MANUFACTURING">Apply to become a manufacturing partner</Link>
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        Curated onboarding. We review every application before invitation.
      </p>
    </main>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-zinc-600">{body}</p>
    </div>
  )
}
