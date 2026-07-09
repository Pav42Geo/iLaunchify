import Link from 'next/link'
import { Factory, ShieldCheck, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Brand } from '@ilaunchify/ui'
import { getPublicBrandLogos } from '@ilaunchify/db'
import { marketingUrl } from '@/lib/marketing-url'
import { LeadForm } from './LeadForm'

export const metadata = { title: 'Apply to join the iLaunchify partner network' }

// Skin ported from the partner /signup page (2026-07-08): while partner
// registration is private-beta, the polished application UI lives here and
// /signup is dormant. The form is LeadForm → submitLead (creates a Lead for
// admin review), NOT public account creation.

const TYPE_LABELS = {
  MANUFACTURING: {
    title: 'Manufacturing partner application',
    description:
      'Tell us about your facility. We review every application and reach out within 3 business days.',
  },
  LABEL_PRINTING: {
    title: 'Print partner application',
    description:
      'Tell us about your shop. We review every application and reach out within 3 business days.',
  },
  COPACKING: {
    title: 'Co-packing partner application',
    description:
      'Tell us about your services. We review every application and reach out within 3 business days.',
  },
}

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const type = ((await searchParams).type ?? 'MANUFACTURING') as keyof typeof TYPE_LABELS
  const meta = TYPE_LABELS[type] ?? TYPE_LABELS.MANUFACTURING
  const logos = await getPublicBrandLogos()

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[var(--bg-hero)] md:h-screen md:grid-cols-[1fr_1fr]">
      {/* Left — dark marketing panel (fills the viewport height; never scrolls) */}
      <aside
        data-surface="dark"
        className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white md:flex"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, var(--color-neon-500) 0%, transparent 60%)' }}
        />

        <div className="relative">
          <a href={marketingUrl('/business')} className="mb-12 flex items-center">
            <Brand
              imageSrc={logos.fullDark}
              sublabel="Business"
              wordmarkClassName="text-white"
              sublabelClassName="text-neon-500"
            />
          </a>

          <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500">
            Partner application
          </div>
          <h1 className="mb-5 max-w-[16ch] font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] md:text-6xl">
            Manufacture for the{' '}
            <span className="font-serif font-medium italic tracking-[-0.025em] text-pink-500">
              next generation
            </span>{' '}
            of brands.
          </h1>
          <p className="max-w-[38ch] text-lg leading-[1.55] text-ink-300">
            Bring your facility online and get matched with brand-ready orders. No cold outreach, no
            contracts to chase — just routed work.
          </p>
        </div>

        <div className="relative mt-12 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
          <Feature icon={Factory} label="Routed orders" />
          <Feature icon={ShieldCheck} label="Vetted creators" />
          <Feature icon={Wallet} label="Stripe payouts" />
        </div>
      </aside>

      {/* Right — application form. Its own scroll area so the page/left panel
          stay put and only the form scrolls if it exceeds the viewport. */}
      <main className="flex items-start justify-center p-6 pt-10 md:h-full md:overflow-y-auto md:p-12">
        <div className="w-full max-w-[560px]">
          {/* Mobile-only logo */}
          <a href={marketingUrl('/business')} className="mb-7 flex items-center md:hidden">
            <Brand imageSrc={logos.fullLight} sublabel="Business" sublabelClassName="text-pink-700" />
          </a>

          <h2 className="text-ui-display mb-1.5 text-ink-900">{meta.title}</h2>
          <p className="mb-5 text-[14px] leading-[1.5] text-ink-600">
            {meta.description} Already approved?{' '}
            <Link href="/login" className="font-semibold text-pink-700 hover:text-pink-600">
              Sign in
            </Link>
            .
          </p>

          <div className="rounded-2xl border border-ink-200 bg-white p-6">
            <LeadForm defaultServiceTypes={[type]} />
          </div>

          <p className="mt-4 text-[12px] leading-[1.5] text-ink-500">
            By applying you agree to our{' '}
            <Link href="/terms" className="text-ink-900 hover:underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-ink-900 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}

function Feature({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div>
      <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-pill border border-white/20 bg-white/10">
        <Icon strokeWidth={2} className="h-4 w-4 text-neon-500" />
      </span>
      <p className="text-[13px] font-semibold leading-tight text-white/90">{label}</p>
    </div>
  )
}
