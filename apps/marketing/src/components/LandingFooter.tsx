import Link from 'next/link'
import { NICHES } from '@/lib/niches'
import { partnerUrl } from '@/lib/app-urls'

/**
 * LandingFooter — shared dark ink-900 footer for the public marketing
 * surface (home, pricing, how-it-works, contact-sales).
 *
 * Four columns:
 *   - Platform   (Marketplace · How it works · Pricing)
 *   - Partners   (For partners · Apply to join · Partner login · Sales)
 *   - Niches     (top four niches as a sampler)
 *   - Company    (Terms · Privacy)
 *
 * Neon-500 uppercase eyebrow per column. Ink-900 bg with neon accents
 * stays inside the "dark surface = neon accent" rule. White wordmark at
 * top, copyright at bottom under a hairline divider.
 */
export function LandingFooter() {
  return (
    <footer
      data-surface="dark"
      className="bg-ink-900 text-white px-6 sm:px-8 py-16 sm:py-20"
    >
      <div className="max-w-[1400px] mx-auto">
        <Link href="/" className="inline-flex items-center gap-2.5 mb-12">
          <span className="w-7 h-7 rounded-md bg-pink-500" />
          <span className="font-display text-2xl font-extrabold tracking-[-0.04em]">
            iLaunchify
          </span>
        </Link>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          <FooterCol title="Platform">
            <FooterLink href="/marketplace">Marketplace</FooterLink>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
          </FooterCol>

          <FooterCol title="Partners">
            <FooterLink href="/business">For partners</FooterLink>
            <FooterLink href={partnerUrl('/signup')} external>
              Apply to join
            </FooterLink>
            <FooterLink href={partnerUrl('/login')} external>
              Partner login
            </FooterLink>
            <FooterLink href="/contact-sales">Talk to sales</FooterLink>
          </FooterCol>

          <FooterCol title="Niches">
            {NICHES.slice(0, 4).map((n) => (
              <FooterLink key={n.slug} href={`/launch/${n.slug}`}>
                {n.shortName}
              </FooterLink>
            ))}
          </FooterCol>

          <FooterCol title="Company">
            <FooterLink href="/terms">Terms</FooterLink>
            <FooterLink href="/privacy">Privacy</FooterLink>
          </FooterCol>
        </div>

        <div className="pt-8 border-t border-white/[0.08] text-[13px] text-white/50">
          © 2026 iLaunchify · Built on the locked design system
        </div>
      </div>
    </footer>
  )
}

function FooterCol({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-4">
        {title}
      </div>
      <ul className="space-y-2.5 text-[14px] text-white/80">{children}</ul>
    </div>
  )
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string
  children: React.ReactNode
  external?: boolean
}) {
  if (external) {
    return (
      <li>
        <a href={href} className="hover:text-white transition-colors">
          {children}
        </a>
      </li>
    )
  }
  return (
    <li>
      <Link href={href} className="hover:text-white transition-colors">
        {children}
      </Link>
    </li>
  )
}
