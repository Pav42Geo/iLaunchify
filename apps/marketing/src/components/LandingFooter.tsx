import Link from 'next/link'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { NICHES } from '@/lib/niches'
import { partnerUrl } from '@/lib/app-urls'

/**
 * LandingFooter — shared dark ink-900 footer for the public marketing
 * surface (home, pricing, how-it-works, contact-sales).
 *
 * Four columns:
 *   - Platform   (Marketplace · How it works · Pricing · Influencers)
 *   - Business   (Why iLaunchify · Apply to join · Partner login · Sales)
 *   - Niches     (top four niches as a sampler)
 *   - Company    (Terms · Privacy · Agreements)
 *
 * Naming note: "Business" replaces the previous "Partners" column label
 * (per Pavel 2026-06-03 rename). Influencer-program link lives under
 * Platform because it's a marketing/affiliate surface, not a manufacturer
 * partner surface.
 *
 * Neon-500 uppercase eyebrow per column. Ink-900 bg with neon accents
 * stays inside the "dark surface = neon accent" rule. White wordmark at
 * top, copyright at bottom under a hairline divider.
 */
export async function LandingFooter() {
  const logos = await getPublicBrandLogos()
  return (
    <footer
      data-surface="dark"
      className="bg-[var(--footer-bg)] text-[var(--footer-fg)] px-6 sm:px-8 py-16 sm:py-20"
    >
      <div className="max-w-[1400px] mx-auto">
        <Link href="/" className="inline-flex items-center mb-12">
          <Brand label="iLaunchify" imageSrc={logos.fullDark} markClassName="h-7 w-7" wordmarkClassName="text-2xl text-[var(--footer-fg)]" />
        </Link>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          <FooterCol title="Platform">
            <FooterLink href="/marketplace">Marketplace</FooterLink>
            <FooterLink href="/how-it-works">How it works</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/influencers">Influencer program</FooterLink>
          </FooterCol>

          <FooterCol title="Business">
            <FooterLink href="/business">Why iLaunchify</FooterLink>
            <FooterLink href={partnerUrl('/signup')} external>
              Apply to join
            </FooterLink>
            <FooterLink href={partnerUrl('/login')} external>
              Partner login
            </FooterLink>
            <FooterLink href="/contact-sales">Talk to sales (Agency)</FooterLink>
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
            <FooterLink href="/creator-agreement">Creator Agreement</FooterLink>
            <FooterLink href="/partner-agreement">Partner Agreement</FooterLink>
          </FooterCol>
        </div>

        <div className="pt-8 border-t border-white/[0.08] text-[13px] text-white/50">
          © 2026 iLaunchify · Built in 2025–2026 · US-only V1
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
