import Link from 'next/link'
import { Button } from '@ilaunchify/ui'
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
export function BusinessHeader() {
  return (
    <header className="sticky top-0 z-50 bg-ink-900 border-b border-ink-700">
      <div className="max-w-[1400px] mx-auto px-8 py-3.5 flex items-center gap-8">
        <Link href="/business" className="flex items-center gap-[9px] flex-shrink-0">
          <span className="w-[26px] h-[26px] rounded-md bg-pink-500" />
          <span className="font-display text-[22px] font-extrabold tracking-[-0.04em] text-white">
            iLaunchify<span className="text-neon-500 font-bold ml-0.5"> Business</span>
          </span>
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
