import Link from 'next/link'
import { LandingFooter } from '@/components/LandingFooter'
import { FileText, ShieldCheck, CreditCard, Users, Factory, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Policies — iLaunchify',
  description: 'iLaunchify legal policies and agreements. Drafts pending legal review.',
  robots: { index: false, follow: false },
}

const POLICIES: Array<{
  title: string
  href: string
  blurb: string
  Icon: typeof FileText
}> = [
  {
    title: 'Terms of Service',
    href: '/terms',
    blurb: 'The master agreement governing access to and use of the iLaunchify platform.',
    Icon: FileText,
  },
  {
    title: 'Privacy Policy',
    href: '/privacy',
    blurb: 'How we collect, use, share, and protect your personal information.',
    Icon: ShieldCheck,
  },
  {
    title: 'Membership Subscription Terms',
    href: '/policies/membership-subscription-terms',
    blurb: 'Billing, automatic renewal, and cancellation terms for paid Builder & Agency plans.',
    Icon: CreditCard,
  },
  {
    title: 'Creator Agreement',
    href: '/policies/creator-agreement',
    blurb: 'Role-specific terms for creators who design products and place production orders.',
    Icon: Users,
  },
  {
    title: 'Partner Agreement',
    href: '/policies/partner-agreement',
    blurb: 'Role-specific terms for manufacturers, printers, co-packers, and warehouse partners.',
    Icon: Factory,
  },
]

export default function PoliciesHubPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-ink-100">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link
            href="/"
            className="text-sm font-semibold text-ink-900 transition-colors hover:text-pink-600"
          >
            ← iLaunchify
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <span className="inline-flex items-center rounded-pill border border-warning-300 bg-warning-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-warning-800">
          Draft
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] text-ink-900">Policies</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-600">
          The legal agreements and policies that govern iLaunchify. These documents are working drafts
          pending legal review and are not yet binding.
        </p>

        <ul className="mt-8 space-y-3">
          {POLICIES.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="group flex items-start gap-4 rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-ink-300 hover:bg-ink-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-700">
                  <p.Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-[16px] font-semibold text-ink-900">{p.title}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-600">{p.blurb}</span>
                </span>
                <ArrowRight
                  className="mt-1 h-4 w-4 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <LandingFooter />
    </main>
  )
}
