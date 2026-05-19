import Link from 'next/link'
import { Button } from '@ilaunchify/ui'

export const metadata = { title: 'Become a Co-Packing Partner — iLaunchify' }

export default function CopackersLanding() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Co-Packing Partners</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Bottling, sealing, kitting at low MOQ. List standalone or alongside manufacturing.
      </p>

      <section className="mt-10 space-y-6">
        <Block
          title="Why co-packing is separate"
          body="On iLaunchify, a Partner is one company that can offer multiple services. Many co-packers also manufacture or print — declare each service independently with its own MOQ and lead time."
        />
        <Block
          title="What you bring"
          body="Container formats (bottle, tub, pouch, sachet), fill types (powder, liquid, capsule, tablet, softgel), certifications (FDA, cGMP, kosher, halal, vegan), low-MOQ ergonomics."
        />
        <Block
          title="What we route"
          body="Orders that need someone to take finished product and put it into retail packaging. Often paired with a separate label-printing dispatch."
        />
      </section>

      <div className="mt-12 flex justify-center">
        <Button asChild size="lg">
          <Link href="/partners/apply?type=COPACKING">Apply to become a co-packing partner</Link>
        </Button>
      </div>
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
