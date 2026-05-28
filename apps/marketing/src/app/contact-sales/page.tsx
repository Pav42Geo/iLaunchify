import Link from 'next/link'
import { Crown, CheckCircle2 } from 'lucide-react'
import { LandingHeader } from '@/components/LandingHeader'
import { LandingFooter } from '@/components/LandingFooter'
import { ContactSalesForm } from '@/components/ContactSalesForm'
import { creatorUrl } from '@/lib/app-urls'

/**
 * /contact-sales — Agency-tier lead capture.
 *
 * The destination for the Agency-tier CTA on /pricing ("Talk to sales") and
 * the optional ?plan=agency deep-link from the upsell modal. Two-column
 * layout: lead form on the left, "What you get" + "What happens next" panel
 * on the right.
 *
 * Submissions go through a stub in V1 (see ContactSalesForm); real wiring
 * routes to admin Leads inbox (see apps/admin /leads — already exists).
 */
export default async function ContactSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; plan?: string }>
}) {
  const { as } = await searchParams
  const isAuthenticated = as === 'user'
  const demoUser = isAuthenticated
    ? {
        name: 'Alex Chen',
        email: 'alex@kindredwellness.co',
        tier: 'maker' as const,
        activeBrandName: 'Kindred Wellness',
      }
    : null

  return (
    <>
      <LandingHeader user={demoUser} hasUnreadNotifications={false} />

      <div className="bg-cream">
        <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-20 sm:pt-16">
          {/* Hero */}
          <div className="max-w-[36ch] mb-12">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] bg-pink-50 text-pink-700 px-2.5 py-1 rounded-pill mb-4">
              <Crown strokeWidth={2.5} className="w-3 h-3" />
              Agency plan
            </div>
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[0.95] tracking-[-0.035em] mb-4">
              Let's plan your{' '}
              <span className="font-serif italic font-medium text-pink-500 tracking-[-0.025em]">
                roster launch.
              </span>
            </h1>
            <p className="text-lg text-ink-700 leading-[1.55]">
              Multi-brand operators and influencer agencies get a 30-minute
              onboarding call with a launch strategist before they touch the
              platform. Tell us what you're building.
            </p>
          </div>

          {/* Form + sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-7 lg:gap-10">
            <ContactSalesForm />

            <aside className="flex flex-col gap-5">
              {/* What you get */}
              <div className="bg-white border border-ink-200 rounded-2xl p-7">
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-pink-700 mb-3">
                  On the Agency plan
                </div>
                <h2 className="font-display text-xl font-bold tracking-[-0.01em] text-ink-900 mb-5">
                  What you get
                </h2>
                <ul className="space-y-3 text-[14px] text-ink-700 leading-[1.5]">
                  {PERKS.map((p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <CheckCircle2
                        strokeWidth={2.5}
                        className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5"
                      />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What happens next */}
              <div className="bg-ink-900 text-white rounded-2xl p-7 relative overflow-hidden">
                <div
                  className="absolute -top-16 -right-16 w-60 h-60 rounded-full opacity-30 pointer-events-none"
                  style={{
                    background:
                      'radial-gradient(circle, var(--color-pink-500) 0%, transparent 60%)',
                  }}
                />
                <div className="relative">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neon-500 mb-3">
                    What happens next
                  </div>
                  <h2 className="font-display text-xl font-bold tracking-[-0.01em] mb-5">
                    Within 24 hours.
                  </h2>
                  <ol className="space-y-4">
                    {STEPS.map((s, i) => (
                      <li key={s.title} className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-pill bg-white/10 border border-white/20 flex items-center justify-center text-[12px] font-bold text-neon-500 flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div>
                          <div className="text-[14px] font-bold text-white mb-0.5">
                            {s.title}
                          </div>
                          <div className="text-[13px] text-white/70 leading-[1.45]">
                            {s.body}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Or self-serve */}
              <div className="border border-ink-200 rounded-2xl p-5 bg-white">
                <div className="text-[13px] text-ink-700 leading-[1.55]">
                  Just one brand, scaling to launch? You don't need a sales
                  call.{' '}
                  <a
                    href={creatorUrl('/signup', { plan: 'builder' })}
                    className="font-semibold text-pink-700 hover:text-pink-600"
                  >
                    Start on Builder for $79/mo →
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <LandingFooter />
    </>
  )
}

const PERKS = [
  'Unlimited brand profiles + unlimited products',
  '9% production-order fee (vs 15% on Maker)',
  'First-look routing to Premier production partners',
  'Bulk volume pricing visibility (500–1,999 / 2k–9,999 / 10k+)',
  'Free first sample + future samples credited against main order',
  'Dedicated account manager with 4-hour SLA',
  'Co-marketing slots in our creator newsletter + case studies',
  'Early access to V1.5+ features (pooled production, buffer inventory)',
]

const STEPS = [
  {
    title: 'We email to schedule a call',
    body: 'Pick a 30-minute slot that works. We confirm by email within one business hour.',
  },
  {
    title: 'Strategy call with a launch lead',
    body: "We walk through your roster, target shelves, and timeline. You ask anything.",
  },
  {
    title: 'You launch your first SKU',
    body: 'We pre-load credits, brand profiles, and Premier-partner contracts before you sign in.',
  },
]
