import Link from 'next/link'
import { Button, Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { partnerUrl } from '@/lib/app-urls'

/**
 * BusinessHeader — solid dark header for the partner-landing surface.
 *
 * Locked rule (DESIGN_SYSTEM.md §1): partner surfaces get a DARK header. The
 * wordmark gets "iLaunchify" (white) + " Business" (neon-500). The CTA is the
 * neon-pill (Business inverse of the creator's black pill).
 *
 * "Partner login" and "Apply now" cross-app into apps/partner via
 * partnerUrl() — they used to point at /business/login + /business/apply
 * which don't exist (those were stub paths). Now they hit the real
 * /signup and /login on port 3002 (apps/partner).
 */
export async function BusinessHeader() {
  const logos = await getPublicBrandLogos()
  return (
    <header className="sticky top-0 z-50 bg-ink-900 border-b border-ink-700">
      <div className="max-w-[1400px] mx-auto px-8 py-3.5 flex items-center gap-8">
        <Link href="/business" className="flex items-center flex-shrink-0">
          <Brand label="iLaunchify" sublabel="Business" imageSrc={logos.fullDark} wordmarkClassName="text-[22px] text-white" sublabelClassName="text-neon-500" />
        </Link>

        <nav className="flex gap-7 text-sm font-medium text-ink-400">
          <a href="#why" className="hover:text-white">
            Why join
          </a>
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#pricing" className="hover:text-white">
            Pricing
          </a>
          <a href="#resources" className="hover:text-white">
            Resources
          </a>
        </nav>

        <div className="flex-1" />

        <a
          href={partnerUrl('/login')}
          className="text-sm font-medium text-ink-300 hover:text-white"
        >
          Partner login
        </a>

        <Button variant="neon" asChild>
          <a href={partnerUrl('/signup')}>Apply now</a>
        </Button>
      </div>
    </header>
  )
}
