import Link from 'next/link'
import { Button } from '@ilaunchify/ui'

export const metadata = { title: 'Become a Print Partner — iLaunchify' }

export default function PrintLanding() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Print Partners</h1>
      <p className="mt-4 text-lg text-zinc-600">
        We deliver print-ready PDF/X-1a files with embedded ICC profiles. You print and ship.
      </p>

      <section className="mt-10 space-y-6">
        <Block
          title="Print formats we support"
          body="Bottle wraps, tub lids, pouch fronts, box panels, stickers. Custom die-cuts on request. Materials: paper, vinyl, polypropylene at launch."
        />
        <Block
          title="Color workflow"
          body="Our pipeline outputs CMYK PDFs with your specified ICC profile (US SWOP V2 default, others supported). Bleed and trim marks included. veraPDF-validated output."
        />
        <Block
          title="Order flow"
          body="Order arrives with print spec + die-cut template + ICC profile. 24 hours to accept; auto-reroute to backup partner if not accepted. Stripe payout on ship."
        />
      </section>

      <div className="mt-12 flex justify-center">
        <Button asChild size="lg">
          <Link href="/partners/apply?type=LABEL_PRINTING">Apply to become a print partner</Link>
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
